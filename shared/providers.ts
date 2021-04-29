import { NEVER, Observable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import * as indicators from './indicators'
import { LanguageSpec, LSIFSupport } from './language-specs/spec'
import { Logger, NoopLogger } from './logging'
import { createProviders as createLSIFProviders } from './lsif/providers'
import { createProviders as createSearchProviders } from './search/providers'
import { TelemetryEmitter } from './telemetry'
import { asArray, mapArrayish, nonEmpty } from './util/helpers'
import { noopAsyncGenerator, observableFromAsyncIterator } from './util/ix'
import { parseGitURI } from './util/uri'

export interface Providers {
    definition: DefinitionProvider
    references: ReferencesProvider
    hover: HoverProvider
    documentHighlights: DocumentHighlightProvider
}

export interface CombinedProviders {
    definitionAndHover: DefinitionAndHoverProvider
    references: ReferencesProvider
    documentHighlights: DocumentHighlightProvider
}

export interface SourcegraphProviders {
    definition: sourcegraph.DefinitionProvider
    references: sourcegraph.ReferenceProvider
    hover: sourcegraph.HoverProvider
    documentHighlights: sourcegraph.DocumentHighlightProvider
}

export interface DefinitionAndHover {
    definition: sourcegraph.Definition | null
    hover: sourcegraph.Hover | null
}

export type DefinitionAndHoverProvider = (
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<DefinitionAndHover | null>

export type DefinitionProvider = (
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Definition, void, undefined>

export type ReferencesProvider = (
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    context: sourcegraph.ReferenceContext
) => AsyncGenerator<sourcegraph.Location[] | null, void, undefined>

export type HoverProvider = (
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Hover | null, void, undefined>

export type DocumentHighlightProvider = (
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => AsyncGenerator<sourcegraph.DocumentHighlight[] | null, void, undefined>

export const noopProviders = {
    definitionAndHover: (): Promise<DefinitionAndHover | null> => Promise.resolve(null),
    definition: noopAsyncGenerator,
    references: noopAsyncGenerator,
    hover: noopAsyncGenerator,
    documentHighlights: noopAsyncGenerator,
}

export interface ProviderWrapper {
    definition: DefinitionWrapper
    references: ReferencesWrapper
    hover: HoverWrapper
    documentHighlights: DocumentHighlightWrapper
}

export type DefinitionWrapper = (provider?: DefinitionProvider) => sourcegraph.DefinitionProvider

export type ReferencesWrapper = (provider?: ReferencesProvider) => sourcegraph.ReferenceProvider

export type HoverWrapper = (provider?: HoverProvider) => sourcegraph.HoverProvider

export type DocumentHighlightWrapper = (provider?: DocumentHighlightProvider) => sourcegraph.DocumentHighlightProvider

export class NoopProviderWrapper implements ProviderWrapper {
    public definition = (provider?: DefinitionProvider): sourcegraph.DefinitionProvider => ({
        provideDefinition: (textDocument: sourcegraph.TextDocument, position: sourcegraph.Position) =>
            provider ? observableFromAsyncIterator(() => provider(textDocument, position)) : NEVER,
    })

    public references = (provider?: ReferencesProvider): sourcegraph.ReferenceProvider => ({
        provideReferences: (
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position,
            context: sourcegraph.ReferenceContext
        ) => (provider ? observableFromAsyncIterator(() => provider(textDocument, position, context)) : NEVER),
    })

    public hover = (provider?: HoverProvider): sourcegraph.HoverProvider => ({
        provideHover: (textDocument: sourcegraph.TextDocument, position: sourcegraph.Position) =>
            provider ? observableFromAsyncIterator(() => provider(textDocument, position)) : NEVER,
    })

    public documentHighlights = (provider?: DocumentHighlightProvider): sourcegraph.DocumentHighlightProvider => ({
        provideDocumentHighlights: (textDocument: sourcegraph.TextDocument, position: sourcegraph.Position) =>
            provider ? observableFromAsyncIterator(() => provider(textDocument, position)) : NEVER,
    })
}

/**
 * Creates a provider wrapper that decorates a given provider with LSIF and search-based behaviors.
 *
 * @param languageSpec The language spec used to provide search-based code intelligence.
 */
export function createProviderWrapper(languageSpec: LanguageSpec, logger: Logger): ProviderWrapper {
    const wrapped: { definition?: sourcegraph.DefinitionProvider } = {}
    const lsifProviders = createLSIFProviders(logger)
    const searchProviders = createSearchProviders(languageSpec, wrapped)

    const providerLogger =
        sourcegraph.configuration.get().get('codeIntel.traceExtension') ?? false ? console : new NoopLogger()

    return {
        // Note: this wrapper only exists during initialization where we
        // determine if we're supporting LSP or not for this session.
        definition: (lspProvider?: DefinitionProvider) => {
            // Register visible definition provider that does not
            // have any active telemetry. This is to reduce the double
            // count of definitions, which are triggered for search-based
            // hover text.
            wrapped.definition = createDefinitionProvider(
                lsifProviders.definitionAndHover,
                searchProviders.definition,
                lspProvider,
                providerLogger,
                languageSpec.languageID,
                true
            )

            // Return the provider with telemetry to use from the root
            return createDefinitionProvider(
                lsifProviders.definitionAndHover,
                searchProviders.definition,
                lspProvider,
                providerLogger,
                languageSpec.languageID
            )
        },

        references: (lspProvider?: ReferencesProvider) =>
            createReferencesProvider(
                lsifProviders.references,
                searchProviders.references,
                lspProvider,
                providerLogger,
                languageSpec.languageID
            ),

        hover: (lspProvider?: HoverProvider) =>
            createHoverProvider(
                languageSpec.lsifSupport || LSIFSupport.None,
                lsifProviders.definitionAndHover,
                searchProviders.definition,
                searchProviders.hover,
                lspProvider,
                providerLogger,
                languageSpec.languageID
            ),

        documentHighlights: () =>
            createDocumentHighlightProvider(lsifProviders.documentHighlights, logger, languageSpec.languageID),
    }
}

/**
 * Creates a definition provider.
 *
 * @param lsifProvider The LSIF-based definition and hover provider.
 * @param searchProvider The search-based definition provider.
 * @param lspProvider An optional LSP-based definition provider.
 * @param logger The logger instance.
 * @param languageID The language the extension recognizes.
 * @param quiet Disable telemetry from this provider. Used for recursive calls from the hover provider when a definition location is required.
 */
export function createDefinitionProvider(
    lsifProvider: DefinitionAndHoverProvider,
    searchProvider: DefinitionProvider,
    lspProvider?: DefinitionProvider,
    logger?: Logger,
    languageID: string = '',
    quiet = false
): sourcegraph.DefinitionProvider {
    return {
        provideDefinition: wrapProvider(async function* (
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position
        ): AsyncGenerator<sourcegraph.Definition | undefined, void, undefined> {
            const emitter = new TelemetryEmitter(languageID, !quiet)
            const { repo } = parseGitURI(new URL(textDocument.uri))
            const commonFields = { provider: 'definition', repo, textDocument, position, emitter, logger }
            const lsifWrapper = await lsifProvider(textDocument, position)
            let hasPreciseResult = false

            for await (const rawResults of asArray(lsifWrapper?.definition || [])) {
                // Mark new results as precise
                const aggregableBadges = [indicators.semanticBadge]
                const results = { ...rawResults, aggregableBadges }
                logLocationResults({ ...commonFields, action: 'lsifDefinitions', results })
                yield results
                hasPreciseResult = true
            }
            if (hasPreciseResult) {
                // Found the best precise definition we'll get. Stop.
                return
            }

            if (lspProvider) {
                // No results so far, fall back to language servers
                for await (const results of lspProvider(textDocument, position)) {
                    // Do not emit definition events for empty location arrays
                    if (!nonEmpty(results)) {
                        continue
                    }

                    logLocationResults({ ...commonFields, action: 'lspDefinitions', results })
                    yield results
                    hasPreciseResult = true
                }
                if (!hasPreciseResult) {
                    // Always emit _something_ regardless if it's interesting. If we return
                    // without emitting anything here we may indefinitely show an empty hover
                    // on identifiers with no interesting data indefinitely.
                    yield []
                }

                // Do not try to supplement with additional search results as we have all the
                // context we need for complete and precise results here.
                return
            }

            // No results so far, fall back to search
            for await (const rawResult of searchProvider(textDocument, position)) {
                if (!nonEmpty(rawResult)) {
                    continue
                }

                // Mark new results as imprecise
                const badge = indicators.impreciseBadge
                const aggregableBadges = [indicators.searchBasedBadge]
                const results = mapArrayish(rawResult, location => ({ ...location, badge, aggregableBadges }))
                logLocationResults({ ...commonFields, action: 'searchDefinitions', results })
                yield results
            }
        }),
    }
}

/** Gets an opaque value that is the same for all locations within a file but different from other files. */
const file = (location_: sourcegraph.Location): string =>
    `${location_.uri.host} ${location_.uri.pathname} ${location_.uri.hash}`

/**
 * Creates a reference provider.
 *
 * @param lsifProvider The LSIF-based references provider.
 * @param searchProvider The search-based references provider.
 * @param lspProvider An optional LSP-based references provider.
 * @param logger The logger instance.
 * @param languageID The language the extension recognizes.
 */
export function createReferencesProvider(
    lsifProvider: ReferencesProvider,
    searchProvider: ReferencesProvider,
    lspProvider?: ReferencesProvider,
    logger?: Logger,
    languageID: string = ''
): sourcegraph.ReferenceProvider {
    return {
        provideReferences: wrapProvider(async function* (
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position,
            context: sourcegraph.ReferenceContext
        ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
            const emitter = new TelemetryEmitter(languageID)
            const { repo } = parseGitURI(new URL(textDocument.uri))
            const commonFields = { repo, textDocument, position, emitter, logger, provider: 'references' }

            let lsifResults: sourcegraph.Location[] = []
            for await (const rawResult of lsifProvider(textDocument, position, context)) {
                if (!nonEmpty(rawResult)) {
                    continue
                }

                // Mark results as precise
                const aggregableBadges = [indicators.semanticBadge]
                lsifResults = asArray(rawResult).map(location => ({ ...location, aggregableBadges }))
                logLocationResults({ ...commonFields, action: 'lsifReferences', results: lsifResults })
                yield lsifResults
            }

            if (lspProvider) {
                for await (const rawResults of lspProvider(textDocument, position, context)) {
                    const lspResults = asArray(rawResults)
                    if (lspResults.length === 0) {
                        continue
                    }

                    // Re-emit the last results from the previous provider so that we do not overwrite
                    // what was emitted previously.
                    const results = lsifResults.concat(lspResults)
                    logLocationResults({ ...commonFields, action: 'lspReferences', results })
                    yield results
                }

                // Do not try to supplement with additional search results as we have all the context
                // we need for complete and precise results here.
                return
            }

            const lsifFiles = new Set(lsifResults.map(file))

            const disableMixedResults = sourcegraph.configuration.get().get('codeIntel.disableMixedResults') ?? false
            if (disableMixedResults && lsifFiles.size > 0) return

            for await (const rawResults of searchProvider(textDocument, position, context)) {
                // Filter out any search results that occur in the same file as LSIF results. These
                // results are definitely incorrect and will pollute the ordering of precise and fuzzy
                // results in the references pane.
                const searchResults = asArray(rawResults).filter(location => !lsifFiles.has(file(location)))
                if (searchResults.length === 0) {
                    continue
                }

                // Mark new results as imprecise, then append them to the previous result set. We need
                // to append here so that we do not overwrite what was emitted previously.
                const badge = indicators.impreciseBadge
                const aggregableBadges = [indicators.searchBasedBadge]
                const results = lsifResults.concat(
                    searchResults.map(location => ({ ...location, badge, aggregableBadges }))
                )
                logLocationResults({ ...commonFields, action: 'searchReferences', results })
                yield results
            }
        }),
    }
}

/** logLocationResults emits telemetry events and emits location counts to the debug logger. */
function logLocationResults<T extends sourcegraph.Badged<sourcegraph.Location>, R extends T | T[] | null>({
    provider,
    action,
    repo,
    textDocument,
    position,
    results,
    emitter,
    logger,
}: {
    provider: string
    action: string
    repo: string
    textDocument: sourcegraph.TextDocument
    position: sourcegraph.Position
    results: R
    emitter?: TelemetryEmitter
    logger?: Logger
}): void {
    emitter?.emitOnce(action)

    // Emit xrepo event if we contain a result from another repository
    if (asArray(results).some(location => parseGitURI(location.uri).repo !== repo)) {
        emitter?.emitOnce(action + '.xrepo')
    }

    if (logger) {
        let arrayResults = asArray(results)
        const totalCount = arrayResults.length
        const searchCount = arrayResults.reduce(
            (count, result) => count + (result.aggregableBadges?.some(badge => badge.text === 'search-based') ? 1 : 0),
            0
        )

        if (arrayResults.length > 500) {
            arrayResults = arrayResults.slice(0, 500)
        }

        const { path } = parseGitURI(new URL(textDocument.uri))
        const { line, character } = position

        logger.log({
            provider,
            path,
            line,
            character,
            preciseCount: totalCount - searchCount,
            searchCount,
            results: arrayResults.map(result => ({
                uri: result.uri.toString(),
                badges: result.aggregableBadges?.map(badge => badge.text),
                ...result.range,
            })),
        })
    }
}

/**
 * Creates a hover provider.
 *
 * @param lsifProvider The LSIF-based definition and hover provider.
 * @param searchDefinitionProvider The search-based definition provider.
 * @param searchHoverProvider The search-based hover provider.
 * @param lspProvider An optional LSP-based hover provider.
 * @param logger The logger instance.
 * @param languageID The language the extension recognizes.
 */
export function createHoverProvider(
    lsifSupport: LSIFSupport,
    lsifProvider: DefinitionAndHoverProvider,
    searchDefinitionProvider: DefinitionProvider,
    searchHoverProvider: HoverProvider,
    lspProvider?: HoverProvider,
    logger?: Logger,
    languageID: string = ''
): sourcegraph.HoverProvider {
    const searchAlerts =
        lsifSupport === LSIFSupport.None
            ? [indicators.searchLSIFSupportNone]
            : lsifSupport === LSIFSupport.Experimental
            ? [indicators.searchLSIFSupportExperimental]
            : lsifSupport === LSIFSupport.Robust
            ? [indicators.searchLSIFSupportRobust]
            : undefined

    return {
        provideHover: wrapProvider(async function* (
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position
        ): AsyncGenerator<sourcegraph.Badged<sourcegraph.Hover> | null | undefined, void, undefined> {
            const emitter = new TelemetryEmitter(languageID)
            const { path } = parseGitURI(new URL(textDocument.uri))
            const commonLogFields = { path, line: position.line, character: position.character }
            const lsifWrapper = await lsifProvider(textDocument, position)

            if (lsifWrapper?.hover) {
                // We have a precise hover, but we might not have a precise definition.
                // We want to tell the difference here, otherwise the definition may take
                // the user to an unrelated location without making it obvious that it's
                // not a precise result.

                let hasSearchBasedDefinition = false
                if (!nonEmpty(lsifWrapper.definition)) {
                    for await (const searchResult of searchDefinitionProvider(textDocument, position)) {
                        if (nonEmpty(searchResult)) {
                            hasSearchBasedDefinition = true
                            break
                        }
                    }
                }

                emitter.emitOnce('lsifHover')
                logger?.log({ provider: 'hover', precise: true, ...commonLogFields })
                yield badgeHoverResult(
                    lsifWrapper.hover,
                    // Display a partial data tooltip when there is a precise hover text but a
                    // search definition. This can happen if we haven't indexed the target
                    // repository, but the dependent repository still has hover information for
                    // externally defined symbols.
                    [!hasSearchBasedDefinition ? indicators.lsif : indicators.lsifPartialHoverOnly],
                    [!hasSearchBasedDefinition ? indicators.semanticBadge : indicators.partialHoverNoDefinitionBadge]
                )

                // Found the best precise hover text we'll get. Stop.
                return
            }

            if (lspProvider) {
                // Delegate to LSP if it's available.
                for await (const lspResult of lspProvider(textDocument, position)) {
                    if (!lspResult) {
                        continue
                    }

                    const first = emitter.emitOnce('lspHover')
                    logger?.log({ provider: 'hover', precise: true, ...commonLogFields })
                    yield badgeHoverResult(
                        lspResult,
                        // We only want to add an alert for the first result in the case
                        // that there are many hover results from the language server.
                        first ? [indicators.lsp] : undefined
                    )
                }

                // Do not try to supplement with additional search results
                // as we have all the context we need for complete and precise
                // results here.
                return
            }

            const hasPreciseDefinition = nonEmpty(lsifWrapper?.definition)

            // No results so far, fall back to search.
            for await (const searchResult of searchHoverProvider(textDocument, position)) {
                if (!searchResult) {
                    continue
                }

                const first = emitter.emitOnce('searchHover')
                logger?.log({ provider: 'hover', precise: false, ...commonLogFields })

                if (hasPreciseDefinition) {
                    // We have a precise definition but imprecise hover text
                    const alerts = first ? [indicators.lsifPartialDefinitionOnly] : undefined
                    const aggregableBadges = [indicators.partialDefinitionNoHoverBadge]
                    yield badgeHoverResult(searchResult, alerts, aggregableBadges)
                    continue
                }

                // Only search results for this token
                const alerts = first ? searchAlerts : undefined
                const aggregableBadges = [indicators.searchBasedBadge]
                yield badgeHoverResult(searchResult, alerts, aggregableBadges)
            }
        }),
    }
}

function badgeHoverResult(
    hover: sourcegraph.Hover,
    alerts?: sourcegraph.HoverAlert[],
    aggregableBadges?: sourcegraph.AggregableBadge[]
): sourcegraph.Badged<sourcegraph.Hover> {
    return { ...hover, ...(alerts ? { alerts } : {}), ...(aggregableBadges ? { aggregableBadges } : {}) }
}

/**
 * Creates a document highlight provider.
 *
 * @param lsifProvider The LSIF-based document highlight provider.
 * @param logger The logger instance.
 * @param languageID The language the extension recognizes.
 */
export function createDocumentHighlightProvider(
    lsifProvider: DocumentHighlightProvider,
    logger?: Logger,
    languageID: string = ''
): sourcegraph.DocumentHighlightProvider {
    return {
        provideDocumentHighlights: wrapProvider(async function* (
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position
        ): AsyncGenerator<sourcegraph.DocumentHighlight[] | null | undefined, void, undefined> {
            const emitter = new TelemetryEmitter(languageID)

            for await (const lsifResult of lsifProvider(textDocument, position)) {
                if (lsifResult) {
                    emitter.emitOnce('lsifDocumentHighlight')
                    yield lsifResult
                }
            }
        }),
    }
}

/**
 * Converts an async generator provider into an observable provider.
 *
 * @param func A function that returns a the provider.
 */
function wrapProvider<P extends unknown[], R>(
    func: (...args: P) => AsyncGenerator<R, void, void>
): (...args: P) => Observable<R> {
    return (...args) => observableFromAsyncIterator(() => func(...args))
}
