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

/** Retrieve a definition for the current hover position. */
function definition(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (doc: sourcegraph.TextDocument, position: sourcegraph.Position) => Promise<sourcegraph.Definition> {
    return async (doc: sourcegraph.TextDocument, position: sourcegraph.Position): Promise<sourcegraph.Definition> => {
        if (getRangeFromWindow) {
            const range = await (await getRangeFromWindow)(doc, position)
            if (range?.definitions && range.definitions.length > 0) {
                return range.definitions
            }
        }

        return definitionForPosition(doc, position, queryGraphQL)
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
    // eslint-disable-next-line @typescript-eslint/require-await
    return async function* (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        if (getRangeFromWindow) {
            const range = await (await getRangeFromWindow)(doc, position)
            if (range?.references) {
                yield range?.references
            }
        }

        yield* referencesForPosition(doc, position, queryGraphQL)
    }
}

/** Retrieve hover text for the current hover position. */
function hover(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (doc: sourcegraph.TextDocument, position: sourcegraph.Position) => Promise<sourcegraph.Hover | null> {
    return async (doc: sourcegraph.TextDocument, position: sourcegraph.Position): Promise<sourcegraph.Hover | null> => {
        if (getRangeFromWindow) {
            const range = await (await getRangeFromWindow)(doc, position)
            if (range?.hover) {
                return hoverPayloadToHover(range?.hover)
            }
        }

        return hoverForPosition(doc, position, queryGraphQL)
    }
}

/** Retrieve references ranges of the current hover position to highlight. */
export function documentHighlights(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (doc: sourcegraph.TextDocument, position: sourcegraph.Position) => Promise<sourcegraph.DocumentHighlight[] | null> {
    return async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.DocumentHighlight[] | null> => {
        if (getRangeFromWindow) {
            const range = await (await getRangeFromWindow)(doc, position)
            if (range?.references) {
                return filterLocationsForDocumentHighlights(doc, range?.references)
            }
        }

        // Fall back to doing a reference request, but only take the first page
        // of results. This may not result in precise highlights if the first page
        // does not contain any/all hovers for the current path. This is a best
        // effort attempt that we don't want to waste too many resources on.
        const { locations } = await referencePageForPosition(doc, position, undefined, queryGraphQL)

        return locations ? filterLocationsForDocumentHighlights(doc, locations) : null
    }
}
