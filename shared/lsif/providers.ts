import * as sourcegraph from 'sourcegraph'
import { Providers, noopProviders } from '../providers'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { asyncGeneratorFromPromise } from '../util/ix'
import { Logger } from '../logging'
import { RangeWindowFactoryFn, makeRangeWindowFactory } from './ranges'
import { hoverPayloadToHover, hoverForPosition } from './hover'
import { definitionForPosition } from './definition'
import { referencesForPosition, referencePageForPosition } from './references'
import { filterLocationsForDocumentHighlights } from './highlights'
import { raceWithDelayOffset } from '../util/promise'

/**
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the GraphQL API.
 *
 * @param logger The logger instance.
 */
export function createProviders(logger: Logger): Providers {
    const enabled = !!sourcegraph.configuration.get().get('codeIntel.lsif')
    if (!enabled) {
        logger.log('LSIF is not enabled in global settings')
        return noopProviders
    }

    const providers = createGraphQLProviders(sgQueryGraphQL, makeRangeWindowFactory(sgQueryGraphQL))

    logger.log('LSIF providers are active')
    return providers
}

/**
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the GraphQL API.
 *
 * @param queryGraphQL The function used to query the GraphQL API.
 * @param getRangeFromWindow The function used to query bulk code intelligence.
 */
export function createGraphQLProviders(
    queryGraphQL: QueryGraphQLFn<any> = sgQueryGraphQL,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): Providers {
    return {
        definition: asyncGeneratorFromPromise(definition(queryGraphQL, getRangeFromWindow)),
        references: references(queryGraphQL, getRangeFromWindow),
        hover: asyncGeneratorFromPromise(hover(queryGraphQL, getRangeFromWindow)),
        documentHighlights: asyncGeneratorFromPromise(documentHighlights(queryGraphQL, getRangeFromWindow)),
    }
}

/** The time to delay between range queries and an explicit definition/reference/hover request. */
const RANGE_RESOLUTION_DELAY = 25

/** Retrieve a definition for the current hover position. */
function definition(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (doc: sourcegraph.TextDocument, position: sourcegraph.Position) => Promise<sourcegraph.Definition> {
    return async (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Definition> => {
        const getDefinitionsFromRangeRequest = async (): Promise<sourcegraph.Definition> => {
            if (getRangeFromWindow) {
                const range = await (await getRangeFromWindow)(textDocument, position)
                if (range?.definitions && range.definitions.length > 0) {
                    return range.definitions
                }
            }

            return null
        }

        // First see if we can query or resolve a window containing this
        // target position. If we've already requested this range, it should
        // be a synchronous return that won't trigger the fallback request.
        // If we don't have the window in memory, wait a very small time for
        // the window to resolve, then fall back to requesting the definition
        // for this position explicitly. This fallback will also happen if we
        // have an empty set of definitions for this position.
        return raceWithDelayOffset(
            getDefinitionsFromRangeRequest(),
            async () => definitionForPosition(textDocument, position, queryGraphQL),
            RANGE_RESOLUTION_DELAY,
            results => results !== null && !(Array.isArray(results) && results.length === 0)
        )
    }
}

/** Retrieve references for the current hover position. */
function references(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
    return async function* (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        const getReferencesFromRangeRequest = async (): Promise<sourcegraph.Location[] | null> => {
            if (getRangeFromWindow) {
                const range = await (await getRangeFromWindow)(textDocument, position)
                if (range?.references && range.references.length > 0) {
                    return range.references
                }
            }

            return null
        }

        // First see if we can query or resolve a window containing this
        // target position. If we've already requested this range, it should
        // be a synchronous return that won't trigger the fallback request.
        // If we don't have the window in memory, wait a very small time for
        // the window to resolve, then fall back to requesting the hover text
        // for this position explicitly. This fallback will also happen if we
        // have a null hover text for this position.
        const localReferences = await raceWithDelayOffset(
            getReferencesFromRangeRequest(),
            () => Promise.resolve(null),
            RANGE_RESOLUTION_DELAY,
            results => results !== null && !(Array.isArray(results) && results.length === 0)
        )

        if (localReferences && localReferences.length < 0) {
            // Yield any references we have immediately
            yield localReferences
        }

        // Replace local references with actual results
        yield* referencesForPosition(textDocument, position, queryGraphQL)
    }
}

/** Retrieve hover text for the current hover position. */
function hover(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (doc: sourcegraph.TextDocument, position: sourcegraph.Position) => Promise<sourcegraph.Hover | null> {
    return async (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Hover | null> => {
        const getHoverFromRangeRequest = async (): Promise<sourcegraph.Hover | null> => {
            if (getRangeFromWindow) {
                const range = await (await getRangeFromWindow)(textDocument, position)
                if (range?.hover) {
                    return hoverPayloadToHover(range?.hover)
                }
            }

            return null
        }

        // First see if we can query or resolve a window containing this
        // target position. If we've already requested this range, it should
        // be a synchronous return that won't trigger the race request below.
        // If we don't have the window in memory, wait a very small
        // time for the window to resolve, then fall back to requesting
        // the hover text for this position explicitly. This fallback will
        // also happen if we have a range that does not contain suitable
        // hover data for this position.
        return raceWithDelayOffset(
            getHoverFromRangeRequest(),
            async () => hoverForPosition(textDocument, position, queryGraphQL),
            RANGE_RESOLUTION_DELAY,
            results => results !== null && results.contents.value !== ''
        )
    }
}

/** Retrieve references ranges of the current hover position to highlight. */
export function documentHighlights(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (doc: sourcegraph.TextDocument, position: sourcegraph.Position) => Promise<sourcegraph.DocumentHighlight[] | null> {
    return async (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.DocumentHighlight[] | null> => {
        if (getRangeFromWindow) {
            const range = await (await getRangeFromWindow)(textDocument, position)
            if (range?.references) {
                return filterLocationsForDocumentHighlights(textDocument, range?.references)
            }
        }

        // Fall back to doing a reference request, but only take the first page
        // of results. This may not result in precise highlights if the first page
        // does not contain any/all hovers for the current path. This is a best
        // effort attempt that we don't want to waste too many resources on.
        const { locations } = await referencePageForPosition(textDocument, position, undefined, queryGraphQL)

        return locations ? filterLocationsForDocumentHighlights(textDocument, locations) : null
    }
}
