import { Observable } from 'rxjs'
import { shareReplay } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { impreciseBadge } from './badges'
import { LanguageSpec } from './language-specs/languages'
import { createProviders as createLSIFProviders } from './lsif/providers'
import { createProviders as createSearchProviders } from './search/providers'
import { noopAsyncGenerator, observableFromAsyncIterator } from './util/ix'
import { asArray, mapArrayish } from './util/util'

export interface Providers {
    definition: DefinitionProvider
    references: ReferencesProvider
    hover: HoverProvider
}

export type DefinitionProvider = (
    doc: sourcegraph.TextDocument,
    pos: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Definition, void, undefined>

export type ReferencesProvider = (
    doc: sourcegraph.TextDocument,
    pos: sourcegraph.Position,
    context: sourcegraph.ReferenceContext
) => AsyncGenerator<sourcegraph.Location[] | null, void, undefined>

export type HoverProvider = (
    doc: sourcegraph.TextDocument,
    pos: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Hover | null, void, undefined>

export const noopProviders = {
    definition: noopAsyncGenerator,
    references: noopAsyncGenerator,
    hover: noopAsyncGenerator,
}

export interface ProviderWrapper {
    definition: DefinitionWrapper
    references: ReferencesWrapper
    hover: HoverWrapper
}

export type DefinitionWrapper = (
    provider?: DefinitionProvider
) => sourcegraph.DefinitionProvider

export type ReferencesWrapper = (
    provider?: ReferencesProvider
) => sourcegraph.ReferenceProvider

export type HoverWrapper = (
    provider?: HoverProvider
) => sourcegraph.HoverProvider

export class NoopProviderWrapper implements ProviderWrapper {
    public definition = (
        provider?: DefinitionProvider
    ): sourcegraph.DefinitionProvider => ({
        provideDefinition: (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ) =>
            provider
                ? observableFromAsyncIterator(provider(doc, pos))
                : new Observable(),
    })

    public references = (
        provider?: ReferencesProvider
    ): sourcegraph.ReferenceProvider => ({
        provideReferences: (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position,
            ctx: sourcegraph.ReferenceContext
        ) =>
            provider
                ? observableFromAsyncIterator(provider(doc, pos, ctx))
                : new Observable(),
    })

    public hover = (provider?: HoverProvider): sourcegraph.HoverProvider => ({
        provideHover: (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ) =>
            provider
                ? observableFromAsyncIterator(provider(doc, pos))
                : new Observable(),
    })
}

/**
 * Creates a provider wrapper that decorates a given provider with LSIF and search-based behaviors.
 *
 * @param languageSpec The language spec used to provide search-based code intelligence.
 */
export function createProviderWrapper(
    languageSpec: LanguageSpec
): ProviderWrapper {
    const lsifProviders = createLSIFProviders()
    const searchProviders = createSearchProviders(languageSpec)

    return {
        definition: (lspProvider?: DefinitionProvider) =>
            createDefinitionProvider(
                lsifProviders.definition,
                searchProviders.definition,
                lspProvider
            ),

        references: (lspProvider?: ReferencesProvider) =>
            createReferencesProvider(
                lsifProviders.references,
                searchProviders.references,
                lspProvider
            ),

        hover: (lspProvider?: HoverProvider) =>
            createHoverProvider(
                lsifProviders.hover,
                searchProviders.hover,
                lspProvider
            ),
    }
}

/**
 * Creates a definition provider.
 *
 * @param lsifProvider The LSIF-based definition provider.
 * @param searchProvider The search-based definition provider.
 * @param lspProvider An optional LSP-based definition provider.
 */
export function createDefinitionProvider(
    lsifProvider: DefinitionProvider,
    searchProvider: DefinitionProvider,
    lspProvider?: DefinitionProvider
): sourcegraph.DefinitionProvider {
    return {
        provideDefinition: wrapProvider(async function*(
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ): AsyncGenerator<sourcegraph.Definition | undefined, void, undefined> {
            let hasLsifResult = false
            for await (const lsifResult of lsifProvider(doc, pos)) {
                if (lsifResult) {
                    hasLsifResult = true
                    yield lsifResult
                }
            }
            if (hasLsifResult) {
                return
            }

            if (lspProvider) {
                yield* lspProvider(doc, pos)
                return
            }

            for await (const searchResult of searchProvider(doc, pos)) {
                yield mapArrayish(searchResult, location => ({
                    ...location,
                    badge: impreciseBadge,
                }))
            }
        }),
    }
}

/**
 * Creates a reference provider.
 *
 * @param lsifProviders The LSIF-based references provider.
 * @param searchProviders The search-based references provider.
 * @param lspProvider An optional LSP-based references provider.
 */
export function createReferencesProvider(
    lsifProvider: ReferencesProvider,
    searchProvider: ReferencesProvider,
    lspProvider?: ReferencesProvider
): sourcegraph.ReferenceProvider {
    // Gets an opaque value that is the same for all locations
    // within a file but different from other files.
    const file = (loc: sourcegraph.Location) =>
        `${loc.uri.host} ${loc.uri.pathname} ${loc.uri.hash}`

    return {
        provideReferences: wrapProvider(async function*(
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position,
            ctx: sourcegraph.ReferenceContext
        ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
            const lsifFiles = new Set()
            for await (const lsifResult of lsifProvider(doc, pos, ctx)) {
                for (const filename of asArray(lsifResult).map(file)) {
                    lsifFiles.add(filename)
                }

                yield lsifResult
            }

            if (lspProvider) {
                yield* lspProvider(doc, pos, ctx)
                return
            }

            // Unconditionally get search references and append them with
            // precise results because LSIF data might be sparse. Remove any
            // search-based result that occurs in a file with an LSIF result.
            for await (const fuzzyRef of searchProvider(doc, pos, ctx)) {
                yield asArray(fuzzyRef)
                    .filter(location => !lsifFiles.has(file(location)))
                    .map(location => ({ ...location, badge: impreciseBadge }))
            }
        }),
    }
}

/**
 * Creates a hover provider.
 *
 * @param lsifProvider The LSIF-based hover provider.
 * @param searchProvider The search-based hover provider.
 * @param lspProvider An optional LSP-based hover provider.
 */
export function createHoverProvider(
    lsifProvider: HoverProvider,
    searchProvider: HoverProvider,
    lspProvider?: HoverProvider
): sourcegraph.HoverProvider {
    return {
        provideHover: wrapProvider(async function*(
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ): AsyncGenerator<
            sourcegraph.Badged<sourcegraph.Hover> | null | undefined,
            void,
            undefined
        > {
            let hasLsifResult = false
            for await (const lsifResult of lsifProvider(doc, pos)) {
                if (lsifResult) {
                    hasLsifResult = true
                    yield lsifResult
                }
            }
            if (hasLsifResult) {
                return
            }

            if (lspProvider) {
                yield* lspProvider(doc, pos)
                return
            }

            for await (const searchResult of searchProvider(doc, pos)) {
                if (searchResult) {
                    yield { ...searchResult, badge: impreciseBadge }
                }
            }
        }),
    }
}

/**
 * Converts an async generator provider into an observable provider. This also
 * memoizes the previous result as a workaround for #1321 (below).
 *
 * [^1]: https://github.com/sourcegraph/sourcegraph/issues/1321
 *
 * @param fn A factory to create the provider.
 */
function wrapProvider<P extends unknown[], R>(
    fn: (...args: P) => AsyncGenerator<R, void, void>
): (...args: P) => Observable<R> {
    let previousResult: Observable<R>
    let previousArgs: P
    return (...args) => {
        if (previousArgs && compareParams(previousArgs, args)) {
            return previousResult
        }
        previousArgs = args
        previousResult = observableFromAsyncIterator(fn(...args)).pipe(
            shareReplay(1)
        )
        return previousResult
    }
}

/**
 * Compare the parameters of definition, reference, and hover providers. This
 * will only compare the document and position parameters and will ignore the
 * third parameter on the references provider.
 *
 * @param x The first set of parameters to compare.
 * @param y The second set of parameters to compare.
 */
function compareParams<P extends unknown>(x: P, y: P): boolean {
    const [doc1, pos1] = x as [sourcegraph.TextDocument, sourcegraph.Position]
    const [doc2, pos2] = y as [sourcegraph.TextDocument, sourcegraph.Position]
    return doc1.uri === doc2.uri && pos1.isEqual(pos2)
}
