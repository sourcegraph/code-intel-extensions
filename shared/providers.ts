import { NEVER, Observable } from 'rxjs'
import { shareReplay } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { impreciseBadge } from './badges'
import { LanguageSpec } from './language-specs/spec'
import { Logger } from './logging'
import { createProviders as createLSIFProviders } from './lsif/providers'
import { createProviders as createSearchProviders } from './search/providers'
import { TelemetryEmitter } from './telemetry'
import { asArray, mapArrayish } from './util/helpers'
import { noopAsyncGenerator, observableFromAsyncIterator } from './util/ix'

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
                ? observableFromAsyncIterator(() => provider(doc, pos))
                : NEVER,
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
                ? observableFromAsyncIterator(() => provider(doc, pos, ctx))
                : NEVER,
    })

    public hover = (provider?: HoverProvider): sourcegraph.HoverProvider => ({
        provideHover: (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ) =>
            provider
                ? observableFromAsyncIterator(() => provider(doc, pos))
                : NEVER,
    })
}

/**
 * Creates a provider wrapper that decorates a given provider with LSIF and search-based behaviors.
 *
 * @param languageSpec The language spec used to provide search-based code intelligence.
 */
export function createProviderWrapper(
    languageSpec: LanguageSpec,
    logger: Logger
): ProviderWrapper {
    const lsifProviders = createLSIFProviders(logger)
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
            const emitter = new TelemetryEmitter()

            let lastLsifResult: sourcegraph.Definition | undefined
            for await (const lsifResult of lsifProvider(doc, pos)) {
                if (lsifResult) {
                    await emitter.emitOnce('lsifDefinitions')
                    yield lsifResult
                    lastLsifResult = lsifResult
                }
            }
            if (lastLsifResult) {
                // Found the best precise definition we'll get. Stop.
                return
            }

            if (lspProvider) {
                for await (const lspResult of lspProvider(doc, pos)) {
                    await emitter.emitOnce('lspDefinitions')
                    yield lspResult
                }

                // Do not try to supplement
                // with additional search results as we have all the context we
                // need for complete and precise results here.
                return
            }

            for await (const searchResult of searchProvider(doc, pos)) {
                // No results so far, fall back to search. Mark the result as
                // imprecise.
                if (searchResult) {
                    await emitter.emitOnce('searchDefinitions')
                    yield badgeValues(searchResult, impreciseBadge)
                }
            }
        }),
    }
}

/**
 * Creates a reference provider.
 *
 * @param lsifProvider The LSIF-based references provider.
 * @param searchProvider The search-based references provider.
 * @param lspProvider An optional LSP-based references provider.
 */
export function createReferencesProvider(
    lsifProvider: ReferencesProvider,
    searchProvider: ReferencesProvider,
    lspProvider?: ReferencesProvider
): sourcegraph.ReferenceProvider {
    // Gets an opaque value that is the same for all locations
    // within a file but different from other files.
    const file = (loc: sourcegraph.Location): string =>
        `${loc.uri.host} ${loc.uri.pathname} ${loc.uri.hash}`

    return {
        provideReferences: wrapProvider(async function*(
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position,
            ctx: sourcegraph.ReferenceContext
        ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
            const emitter = new TelemetryEmitter()

            let lsifResults: sourcegraph.Location[] = []
            for await (const lsifResult of lsifProvider(doc, pos, ctx)) {
                if (lsifResult) {
                    await emitter.emitOnce('lsifReferences')
                    yield lsifResult
                    lsifResults = lsifResult
                }
            }

            if (lspProvider) {
                for await (const lspResult of lspProvider(doc, pos, ctx)) {
                    // TODO - reduce duplicates between LSIF and LSP
                    const filteredResults = asArray(lspResult)
                    if (filteredResults.length === 0) {
                        continue
                    }

                    // Re-emit the last results from the previous provider
                    // so we do not overwrite what was emitted previously.
                    await emitter.emitOnce('lspReferences')
                    yield lsifResults.concat(filteredResults)
                }

                // Do not try to supplement with additional search results
                // as we have all the context we need for complete and precise
                // results here.
                return
            }

            const lsifFiles = new Set(lsifResults.map(file))

            for await (const searchResult of searchProvider(doc, pos, ctx)) {
                // Filter out any search results that occur in the same file
                // as LSIF results. These results are definitely incorrect and
                // will pollute the ordering of precise and fuzzy results in
                // the references pane.
                const filteredResults = asArray(searchResult).filter(
                    l => !lsifFiles.has(file(l))
                )
                if (filteredResults.length === 0) {
                    continue
                }

                // Re-emit the last results from the previous provider so we
                // do not overwrite what was emitted previously. Mark new results
                // as imprecise.
                await emitter.emitOnce('searchReferences')
                yield lsifResults.concat(
                    asArray(badgeValues(filteredResults, impreciseBadge))
                )
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
            const emitter = new TelemetryEmitter()

            let lastLsifResult: sourcegraph.Hover | null | undefined
            for await (const lsifResult of lsifProvider(doc, pos)) {
                if (lsifResult) {
                    await emitter.emitOnce('lsifHover')
                    yield lsifResult
                    lastLsifResult = lsifResult
                }
            }
            if (lastLsifResult) {
                // Found the best precise hover text we'll get. Stop.
                return
            }

            if (lspProvider) {
                // Delegate to LSP if it's available.
                for await (const lspResult of lspProvider(doc, pos)) {
                    if (lspResult) {
                        await emitter.emitOnce('lspHover')
                        yield lspResult
                    }
                }

                // Do not try to supplement with additional search results
                // as we have all the context we need for complete and precise
                // results here.
                return
            }

            for await (const searchResult of searchProvider(doc, pos)) {
                // No results so far, fall back to search. Mark the result as
                // imprecise.
                if (searchResult) {
                    await emitter.emitOnce('searchHover')
                    yield { ...searchResult, badge: impreciseBadge }
                }
            }
        }),
    }
}

/**
 * Add a badge property to a single value or to a list of values. Returns the
 * modified result in the same shape as the input.
 *
 * @param value The list of values, a single value, or null.
 * @param badge The badge attachment.
 */
export function badgeValues<T extends object>(
    value: T | T[] | null,
    badge: sourcegraph.BadgeAttachmentRenderOptions
): sourcegraph.Badged<T> | sourcegraph.Badged<T>[] | null {
    return mapArrayish(value, v => ({ ...v, badge }))
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
        previousResult = observableFromAsyncIterator(() => fn(...args)).pipe(
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
