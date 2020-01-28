import * as sourcegraph from 'sourcegraph'
import { HandlerArgs, Handler } from './search/handler'
import { initLSIF } from './lsif/activation'
import { impreciseBadge } from './badges'
import {
    map,
    finalize,
    distinctUntilChanged,
    shareReplay,
} from 'rxjs/operators'
import { BehaviorSubject, from, Observable, noop } from 'rxjs'
import { createAbortError } from './abortion'
import {
    LSPProviders,
    ExternalReferenceProvider,
    ImplementationsProvider,
} from './lsp/providers'
import { LSIFProviders } from './lsif/providers'
import { SearchProviders } from './search/providers'

export function activateCodeIntel(
    ctx: sourcegraph.ExtensionContext,
    selector: sourcegraph.DocumentSelector,
    handlerArgs: HandlerArgs,
    lspProviders?: LSPProviders
): void {
    const lsifProviders = initLSIF()
    const searchProviders = new Handler(handlerArgs)

    ctx.subscriptions.add(
        sourcegraph.languages.registerDefinitionProvider(
            selector,
            createDefinitionProvider(
                lsifProviders,
                searchProviders,
                lspProviders
            )
        )
    )
    ctx.subscriptions.add(
        sourcegraph.languages.registerReferenceProvider(
            selector,
            createReferencesProvider(
                lsifProviders,
                searchProviders,
                lspProviders
            )
        )
    )
    ctx.subscriptions.add(
        sourcegraph.languages.registerHoverProvider(
            selector,
            createHoverProvider(lsifProviders, searchProviders, lspProviders)
        )
    )

    if (lspProviders) {
        const externalReferencesProvider = lspProviders.externalReferences
        const implementationsProvider = lspProviders.implementations

        if (externalReferencesProvider) {
            registerExternalReferencesProvider(
                ctx,
                selector,
                externalReferencesProvider
            )
        }

        if (implementationsProvider) {
            registerImplementationsProvider(
                ctx,
                selector,
                implementationsProvider
            )
        }
    }
}

function createDefinitionProvider(
    lsifProviders: LSIFProviders,
    searchProviders: SearchProviders,
    lspProviders?: LSPProviders
): sourcegraph.DefinitionProvider {
    async function* provideDefinition(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<
        sourcegraph.Definition | null | undefined,
        void,
        undefined
    > {
        const lsifResult = await lsifProviders.definition(doc, pos)
        if (lsifResult) {
            yield lsifResult
            return
        }

        if (lspProviders) {
            yield* lspProviders.definition(doc, pos)
            return
        }

        let searchResult = await searchProviders.definition(doc, pos)
        if (!searchResult) {
            yield undefined
            return
        }

        if (!Array.isArray(searchResult)) {
            yield { ...searchResult, badge: impreciseBadge }
            return
        }

        yield searchResult.map(v => ({ ...v, badge: impreciseBadge }))
    }

    return {
        provideDefinition: wrap(areProviderParamsEqual, provideDefinition),
    }
}

function createReferencesProvider(
    lsifProviders: LSIFProviders,
    searchProviders: SearchProviders,
    lspProviders?: LSPProviders
): sourcegraph.ReferenceProvider {
    // Gets an opaque value that is the same for all locations
    // within a file but different from other files.
    const file = (loc: sourcegraph.Location) =>
        `${loc.uri.host} ${loc.uri.pathname} ${loc.uri.hash}`

    async function* provideReferences(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        ctx: sourcegraph.ReferenceContext
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        if (lspProviders) {
            yield* lspProviders.references(doc, pos, ctx)
            return
        }

        // Get and extract LSIF results
        const lsifResult = await lsifProviders.references(doc, pos)
        const lsifReferences = lsifResult || []
        const lsifFiles = new Set(lsifReferences.map(file))

        // Unconditionally get search references and append them with
        // precise results because LSIF data might be sparse. Remove any
        // search-based result that occurs in a file with an LSIF result.
        const searchResults = (
            (await searchProviders.references(doc, pos)) || []
        ).filter(fuzzyRef => !lsifFiles.has(file(fuzzyRef)))

        yield [
            ...lsifReferences,
            ...searchResults.map(v => ({
                ...v,
                badge: impreciseBadge,
            })),
        ]
    }

    return {
        provideReferences: wrap(
            areProviderParamsContextEqual,
            provideReferences
        ),
    }
}

function createHoverProvider(
    lsifProviders: LSIFProviders,
    searchProviders: SearchProviders,
    lspProviders?: LSPProviders
): sourcegraph.HoverProvider {
    async function* provideHover(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<
        sourcegraph.Badged<sourcegraph.Hover> | null | undefined,
        void,
        undefined
    > {
        const lsifResult = await lsifProviders.hover(doc, pos)
        if (lsifResult) {
            yield lsifResult
            return
        }

        if (lspProviders) {
            yield* lspProviders.hover(doc, pos)
            return
        }

        const searchResult = await searchProviders.hover(doc, pos)
        if (!searchResult) {
            yield undefined
            return
        }

        yield { ...searchResult, badge: impreciseBadge }
    }

    return {
        provideHover: wrap(areProviderParamsEqual, provideHover),
    }
}

function registerExternalReferencesProvider<S extends { [key: string]: any }>(
    ctx: sourcegraph.ExtensionContext,
    selector: sourcegraph.DocumentSelector,
    externalReferencesProvider: ExternalReferenceProvider
) {
    const settings: BehaviorSubject<Partial<S>> = new BehaviorSubject<
        Partial<S>
    >({})
    ctx.subscriptions.add(
        sourcegraph.configuration.subscribe(() => {
            settings.next(sourcegraph.configuration.get<Partial<S>>().value)
        })
    )

    let registration: sourcegraph.Unsubscribable | undefined

    const register = () => {
        registration = sourcegraph.languages.registerReferenceProvider(
            selector,
            createExternalReferencesProvider(externalReferencesProvider)
        )
    }

    const deregister = () => {
        if (registration) {
            registration.unsubscribe()
            registration = undefined
        }
    }

    ctx.subscriptions.add(
        from(settings)
            .pipe(
                map(
                    settings =>
                        !!settings[externalReferencesProvider.settingName]
                ),
                distinctUntilChanged(),
                map(enabled => (enabled ? register : deregister)()),
                finalize(() => deregister())
            )
            .subscribe()
    )
}

function createExternalReferencesProvider(
    externalReferencesProvider: ExternalReferenceProvider
): sourcegraph.ReferenceProvider {
    return {
        provideReferences: wrap(
            areProviderParamsContextEqual,
            externalReferencesProvider.references.bind(
                externalReferencesProvider
            )
        ),
    }
}

function registerImplementationsProvider(
    ctx: sourcegraph.ExtensionContext,
    selector: sourcegraph.DocumentSelector,
    implementationsProvider: ImplementationsProvider
) {
    ctx.subscriptions.add(
        sourcegraph.languages.registerLocationProvider(
            implementationsProvider.implId,
            selector,
            {
                provideLocations: wrap(
                    areProviderParamsEqual,
                    implementationsProvider.locations.bind(
                        implementationsProvider
                    )
                ),
            }
        )
    )

    const IMPL_ID = implementationsProvider.implId
    const panelView = sourcegraph.app.createPanelView(IMPL_ID)
    panelView.title = implementationsProvider.panelTitle
    panelView.component = { locationProvider: IMPL_ID }
    panelView.priority = 160
    ctx.subscriptions.add(panelView)
}

//
//
//

const wrap = <P extends any[], R>(
    compare: (a: P, b: P) => boolean,
    fn: (...args: P) => AsyncGenerator<R, void, void>
): ((...args: P) => Observable<R>) =>
    memoizePrevious(compare, (...args) =>
        observableFromAsyncGenerator(abortPrevious(() => fn(...args))).pipe(
            shareReplay(1)
        )
    )

const areProviderParamsEqual = (
    [doc1, pos1]: [sourcegraph.TextDocument, sourcegraph.Position],
    [doc2, pos2]: [sourcegraph.TextDocument, sourcegraph.Position]
): boolean => doc1.uri === doc2.uri && pos1.isEqual(pos2)

const areProviderParamsContextEqual = (
    [doc1, pos1]: [
        sourcegraph.TextDocument,
        sourcegraph.Position,
        sourcegraph.ReferenceContext
    ],
    [doc2, pos2]: [
        sourcegraph.TextDocument,
        sourcegraph.Position,
        sourcegraph.ReferenceContext
    ]
): boolean => areProviderParamsEqual([doc1, pos1], [doc2, pos2])

/** Workaround for https://github.com/sourcegraph/sourcegraph/issues/1321 */
function memoizePrevious<P extends any[], R>(
    compare: (a: P, b: P) => boolean,
    fn: (...args: P) => R
): (...args: P) => R {
    let previousResult: R
    let previousArgs: P
    return (...args) => {
        if (previousArgs && compare(previousArgs, args)) {
            return previousResult
        }
        previousArgs = args
        previousResult = fn(...args)
        return previousResult
    }
}

const observableFromAsyncGenerator = <T>(
    generator: () => AsyncGenerator<T, unknown, void>
): Observable<T> =>
    new Observable(observer => {
        const iterator = generator()
        let unsubscribed = false
        let iteratorDone = false
        function next(): void {
            iterator.next().then(
                result => {
                    if (unsubscribed) {
                        return
                    }
                    if (result.done) {
                        iteratorDone = true
                        observer.complete()
                    } else {
                        observer.next(result.value)
                        next()
                    }
                },
                err => {
                    observer.error(err)
                }
            )
        }
        next()
        return () => {
            unsubscribed = true
            if (!iteratorDone && iterator.throw) {
                iterator.throw(createAbortError()).catch(() => {
                    // ignore
                })
            }
        }
    })

/**
 * Similar to Rx `switchMap`, finishes the generator returned from the previous call whenever the function is called again.
 *
 * Workaround for https://github.com/sourcegraph/sourcegraph/issues/1190
 */
const abortPrevious = <P extends any[], R>(
    fn: (...args: P) => AsyncGenerator<R, void, void>
): ((...args: P) => AsyncGenerator<R, void, void>) => {
    let abort = noop
    return async function*(...args) {
        abort()
        let aborted = false
        abort = () => {
            aborted = true
        }
        for await (const element of fn(...args)) {
            if (aborted) {
                return
            }
            yield element
            if (aborted) {
                return
            }
        }
    }
}
