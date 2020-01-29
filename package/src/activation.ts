import * as sourcegraph from 'sourcegraph'
import { HandlerArgs, Handler } from './search/handler'
import { initLSIF } from './lsif/activation'
import { impreciseBadge } from './badges'
import { shareReplay } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { createAbortError } from './abort'
import { LSPProviders } from './lsp/providers'
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

//
//
//

const wrap = <P extends any[], R>(
    compare: (a: P, b: P) => boolean,
    fn: (...args: P) => AsyncGenerator<R, void, void>
): ((...args: P) => Observable<R>) =>
    memoizePrevious(compare, (...args) =>
        observableFromAsyncGenerator(() => fn(...args)).pipe(shareReplay(1))
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
