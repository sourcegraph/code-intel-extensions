import * as sourcegraph from 'sourcegraph'
import { Providers, noopProviders } from '../providers'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { asyncGeneratorFromPromise } from '../util/ix'
import { Logger } from '../logging'
import { WindowFactoryFn, makeWindowFactory } from './window'
import { hoverPayloadToHover, hoverForPosition } from './hover'
import { definitionForPosition } from './definition'
import { referencesForPosition } from './references'

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

    const providers = createGraphQLProviders(
        sgQueryGraphQL,
        makeWindowFactory(sgQueryGraphQL)
    )

    logger.log('LSIF providers are active')
    return providers
}

/**
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the GraphQL API.
 *
 * @param queryGraphQL The function used to query the GraphQL API.
 * @param getBulkLocalIntelligence The function used to query bulk code intelligence.
 */
export function createGraphQLProviders(
    queryGraphQL: QueryGraphQLFn<any> = sgQueryGraphQL,
    getBulkLocalIntelligence?: Promise<WindowFactoryFn>
): Providers {
    return {
        definition: asyncGeneratorFromPromise(
            definition(queryGraphQL, getBulkLocalIntelligence)
        ),
        references: references(queryGraphQL, getBulkLocalIntelligence),
        hover: asyncGeneratorFromPromise(
            hover(queryGraphQL, getBulkLocalIntelligence)
        ),
    }
}

/** Retrieve a definition for the current hover position. */
function definition(
    queryGraphQL: QueryGraphQLFn<any>,
    getBulkLocalIntelligence?: Promise<WindowFactoryFn>
): (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<sourcegraph.Definition> {
    return async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Definition> => {
        if (getBulkLocalIntelligence) {
            const aggregateCodeIntelligence = await (
                await getBulkLocalIntelligence
            )(doc, position)
            if (
                aggregateCodeIntelligence?.definitions &&
                aggregateCodeIntelligence.definitions.length > 0
            ) {
                return aggregateCodeIntelligence.definitions
            }
        }

        return definitionForPosition(doc, position, queryGraphQL)
    }
}

/** Retrieve references for the current hover position. */
function references(
    queryGraphQL: QueryGraphQLFn<any>,
    getBulkLocalIntelligence?: Promise<WindowFactoryFn>
): (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
    // eslint-disable-next-line @typescript-eslint/require-await
    return async function*(
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        if (getBulkLocalIntelligence) {
            const aggregateCodeIntelligence = await (
                await getBulkLocalIntelligence
            )(doc, position)
            if (aggregateCodeIntelligence?.references) {
                yield aggregateCodeIntelligence?.references
            }
        }

        yield* referencesForPosition(doc, position, queryGraphQL)
    }
}

/** Retrieve hover text for the current hover position. */
function hover(
    queryGraphQL: QueryGraphQLFn<any>,
    getBulkLocalIntelligence?: Promise<WindowFactoryFn>
): (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<sourcegraph.Hover | null> {
    return async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Hover | null> => {
        if (getBulkLocalIntelligence) {
            const aggregateCodeIntelligence = await (
                await getBulkLocalIntelligence
            )(doc, position)
            if (aggregateCodeIntelligence?.hover) {
                return hoverPayloadToHover(aggregateCodeIntelligence?.hover)
            }
        }

        return hoverForPosition(doc, position, queryGraphQL)
    }
}
