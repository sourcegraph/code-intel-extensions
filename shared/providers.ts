import { NEVER, Observable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { impreciseBadge } from './badges'
import { LanguageSpec, LSIFSupport } from './language-specs/spec'
import { Logger, NoopLogger } from './logging'
import { createProviders as createLSIFProviders } from './lsif/providers'
import { createProviders as createSearchProviders } from './search/providers'
import { TelemetryEmitter } from './telemetry'
import { asArray, mapArrayish, nonEmpty } from './util/helpers'
import { noopAsyncGenerator, observableFromAsyncIterator } from './util/ix'
import * as HoverAlerts from './hover-alerts'
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
 * @param quiet Disable telemetry from this provider.
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

            let hasPreciseResult = false
            const lsifWrapper = await lsifProvider(textDocument, position)
            if (lsifWrapper) {
                for await (const rawResult of asArray(lsifWrapper.definition || [])) {
                    hasPreciseResult = true

                    await emitter.emitOnce('lsifDefinitions')
                    const lsifResult = {
                        ...rawResult,
                        aggregableBadges: [
                            {
                                text: 'semantic',
                                linkURL: HoverAlerts.linkURL,
                                hoverMessage: 'PARTIAL OR SOMETHING' /* TODO */,
                            },
                        ],
                    }
                    await emitCrossRepositoryEventForLocations(emitter, 'lsifDefinitions', repo, lsifResult)
                    traceLocations('definition', textDocument, position, lsifResult, logger)
                    yield lsifResult
                }
            }
            if (hasPreciseResult) {
                // Found the best precise definition we'll get. Stop.
                return
            }

            if (lspProvider) {
                for await (const lspResult of lspProvider(textDocument, position)) {
                    // Do not emit definition events for empty location arrays
                    if (nonEmpty(lspResult)) {
                        await emitter.emitOnce('lspDefinitions')
                        await emitCrossRepositoryEventForLocations(emitter, 'lspDefinitions', repo, lspResult)
                        traceLocations('definition', textDocument, position, lspResult, logger)
                    }

                    // Always emit the result regardless if it's interesting. If we return
                    // without emitting anything here we may indefinitely show an empty hover
                    // on identifiers with no interesting data indefinitely.
                    yield lspResult
                }

                // Do not try to supplement with additional search results as we have all the
                // context we need for complete and precise results here.
                return
            }

            // No results so far, fall back to search
            for await (const searchResult of searchProvider(textDocument, position)) {
                if (!nonEmpty(searchResult)) {
                    continue
                }

                // Mark the result as imprecise
                const results = badgeValues(searchResult, impreciseBadge)

                await emitter.emitOnce('searchDefinitions')
                await emitCrossRepositoryEventForLocations(emitter, 'searchDefinitions', repo, results)
                traceLocations('definition', textDocument, position, results, logger)
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

            let lsifResults: sourcegraph.Location[] = []
            for await (const rawResult of lsifProvider(textDocument, position, context)) {
                if (nonEmpty(rawResult)) {
                    const lsifResult = asArray(rawResult).map(
                        result =>
                            (({
                                ...result,
                                aggregableBadges: [
                                    {
                                        text: 'semantic',
                                        linkURL: HoverAlerts.linkURL,
                                        hoverMessage: 'PARTIAL OR SOMETHING' /* TODO */,
                                    },
                                ],
                            } as any) as sourcegraph.Location)
                    ) // TODO - update package
                    lsifResults = lsifResult

                    await emitter.emitOnce('lsifReferences')
                    await emitCrossRepositoryEventForLocations(emitter, 'lsifReferences', repo, lsifResult)
                    traceLocations('references', textDocument, position, lsifResult, logger)
                    yield lsifResult
                }
            }

            if (lspProvider) {
                for await (const lspResult of lspProvider(textDocument, position, context)) {
                    const filteredResults = asArray(lspResult)
                    if (filteredResults.length === 0) {
                        continue
                    }

                    // Re-emit the last results from the previous provider
                    // so we do not overwrite what was emitted previously.
                    const results = lsifResults.concat(filteredResults)

                    await emitter.emitOnce('lspReferences')
                    await emitCrossRepositoryEventForLocations(emitter, 'lspReferences', repo, results)
                    traceLocations('references', textDocument, position, results, logger)
                    yield results
                }

                // Do not try to supplement with additional search results
                // as we have all the context we need for complete and precise
                // results here.
                return
            }

            const lsifFiles = new Set(lsifResults.map(file))

            for await (const searchResult of searchProvider(textDocument, position, context)) {
                // Filter out any search results that occur in the same file
                // as LSIF results. These results are definitely incorrect and
                // will pollute the ordering of precise and fuzzy results in
                // the references pane.
                const filteredResults = asArray(searchResult).filter(location => !lsifFiles.has(file(location)))
                if (filteredResults.length === 0) {
                    continue
                }

                // Re-emit the last results from the previous provider so we
                // do not overwrite what was emitted previously. Mark new results
                // as imprecise.
                const results = lsifResults.concat(asArray(badgeValues(filteredResults, impreciseBadge)))

                await emitter.emitOnce('searchReferences')
                await emitCrossRepositoryEventForLocations(emitter, 'searchReferences', repo, results)
                traceLocations('references', textDocument, position, results, logger)
                yield results
            }
        }),
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
            ? [HoverAlerts.searchLSIFSupportNone]
            : lsifSupport === LSIFSupport.Experimental
            ? [HoverAlerts.searchLSIFSupportExperimental]
            : lsifSupport === LSIFSupport.Robust
            ? [HoverAlerts.searchLSIFSupportRobust]
            : undefined

    return {
        provideHover: wrapProvider(async function* (
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position
        ): AsyncGenerator<sourcegraph.Badged<sourcegraph.Hover> | null | undefined, void, undefined> {
            const emitter = new TelemetryEmitter(languageID)
            let hasPreciseDefinition = false
            const { path } = parseGitURI(new URL(textDocument.uri))
            const commonLogFields = { path, line: position.line, character: position.character }

            const lsifWrapper = await lsifProvider(textDocument, position)
            if (lsifWrapper) {
                if (lsifWrapper.hover) {
                    let partialPreciseData = false
                    if (!nonEmpty(lsifWrapper.definition)) {
                        for await (const searchResult of searchDefinitionProvider(textDocument, position)) {
                            if (nonEmpty(searchResult)) {
                                partialPreciseData = true
                                break
                            }
                        }
                    }

                    // Display a partial data tooltip when there is a precise hover
                    // text but a search definition. This can happen if we haven't
                    // indexed the target repository.
                    const alerts = !partialPreciseData ? [HoverAlerts.lsif] : [HoverAlerts.lsifPartialHoverOnly]

                    // Found the best precise hover text we'll get. Stop.
                    await emitter.emitOnce('lsifHover')
                    logger?.log({ provider: 'hover', precise: true, ...commonLogFields })
                    yield {
                        ...lsifWrapper.hover,
                        alerts,
                        aggregableBadges: [
                            {
                                text: partialPreciseData ? 'partial semantic' : 'semantic',
                                linkURL: HoverAlerts.linkURL,
                                hoverMessage: 'PARTIAL OR SOMETHING' /* TODO */,
                            },
                        ],
                    } as any // TODO - update package
                    return
                }

                if (nonEmpty(lsifWrapper.definition)) {
                    hasPreciseDefinition = true
                }
            }

            if (lspProvider) {
                let alerts: sourcegraph.Badged<sourcegraph.HoverAlert>[] | undefined = [HoverAlerts.lsp]
                for await (const lspResult of lspProvider(textDocument, position)) {
                    if (lspResult) {
                        // Delegate to LSP if it's available.
                        await emitter.emitOnce('lspHover')
                        logger?.log({ provider: 'hover', precise: true, ...commonLogFields })
                        yield { ...lspResult, ...(alerts ? { alerts } : {}) }
                        alerts = undefined
                    }
                }

                // Do not try to supplement with additional search results
                // as we have all the context we need for complete and precise
                // results here.
                return
            }

            let alerts = hasPreciseDefinition ? [HoverAlerts.lsifPartialDefinitionOnly] : searchAlerts

            for await (const searchResult of searchHoverProvider(textDocument, position)) {
                if (searchResult) {
                    // No results so far, fall back to search. Mark the result as imprecise.
                    await emitter.emitOnce('searchHover')
                    logger?.log({ provider: 'hover', precise: false, ...commonLogFields })
                    yield {
                        ...searchResult,
                        ...(alerts ? { alerts } : {}),
                        aggregableBadges: [
                            {
                                text: hasPreciseDefinition ? 'partial semantic' : 'search-based',
                                linkURL: HoverAlerts.linkURL,
                                hoverMessage: 'PARTIAL OR SOMETHING', // TODO
                            },
                        ],
                    } as any // TODO - update package
                    alerts = undefined
                }
            }
        }),
    }
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
                    await emitter.emitOnce('lsifDocumentHighlight')
                    yield lsifResult
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
    return mapArrayish(value, element => ({
        ...element,
        badge,
        aggregableBadges: [
            { text: 'search-based', linkURL: HoverAlerts.linkURL, hoverMessage: 'PARTIAL OR SOMETHING' /* TODO */ },
        ],
    })) // TODO - update package
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

/**
 * Emits an {action}.xrepo event if the given result contains a location for a different repository.
 *
 * @param emitter The telemetry emitter.
 * @param action The base name of the event to emit.
 * @param repo The source repository.
 * @param results Location results from the provider.
 */
async function emitCrossRepositoryEventForLocations<
    T extends sourcegraph.Badged<sourcegraph.Location>,
    R extends T | T[] | null
>(emitter: TelemetryEmitter, action: string, repo: string, results: R): Promise<void> {
    for (const result of asArray(results)) {
        if (parseGitURI(result.uri).repo !== repo) {
            // Emit xrepo event
            await emitter.emitOnce(action + '.xrepo')
        }
    }
}

/**
 * Emits each location result to the given logger.
 *
 * @param provider The name of the provider.
 * @param textDocument The input text document.
 * @param position The input position.
 * @param results Location results from the provider.
 * @param logger The logger instance.
 */
function traceLocations<T extends sourcegraph.Badged<sourcegraph.Location>, R extends T | T[] | null>(
    provider: string,
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    results: R,
    logger?: Logger
): void {
    if (!logger) {
        return
    }

    let arrayResults = asArray(results)
    const totalCount = arrayResults.length
    const preciseCount = arrayResults.reduce((count, result) => count + (result.badge === undefined ? 1 : 0), 0)

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
        preciseCount,
        searchCount: totalCount - preciseCount,
        results: arrayResults.map(result => ({
            uri: result.uri.toString(),
            badged: result.badge !== undefined,
            ...result.range,
        })),
    })
}
