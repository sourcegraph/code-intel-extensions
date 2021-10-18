import * as sourcegraph from 'sourcegraph'

import { Logger } from '../logging'
import { noopProviders, CombinedProviders, DefinitionAndHover } from '../providers'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { asyncGeneratorFromPromise, cachePromiseProvider } from '../util/ix'
import { raceWithDelayOffset } from '../util/promise'

import { definitionAndHoverForPosition, hoverPayloadToHover } from './definition-hover'
import { filterLocationsForDocumentHighlights } from './highlights'
import { RangeWindowFactoryFn, makeRangeWindowFactory } from './ranges'
import { referencesForPosition, referencePageForPosition } from './references'
import { stencil } from './stencil'

/**
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the GraphQL API.
 *
 * @param logger The logger instance.
 */
export function createProviders(logger: Logger): CombinedProviders {
    const enabled = sourcegraph.configuration.get().get('codeIntel.lsif') ?? true
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
): CombinedProviders {
    return {
        definitionAndHover: cachePromiseProvider(definitionAndHover(queryGraphQL, getRangeFromWindow)),
        references: references(queryGraphQL, getRangeFromWindow),
        documentHighlights: asyncGeneratorFromPromise(documentHighlights(queryGraphQL, getRangeFromWindow)),
    }
}

/** The time in ms to delay between range queries and an explicit definition/reference/hover request. */
const RANGE_RESOLUTION_DELAY_MS = 25

const stencilCache: Map<string, Promise<sourcegraph.Range[]>> = new Map()

function stencilCached(textDocument: sourcegraph.TextDocument): Promise<sourcegraph.Range[] | undefined> {
    let renameme = stencilCache.get(textDocument.uri)
    if (renameme !== undefined) {
        return renameme
    }

    renameme = stencil(textDocument).then(response => response?.stencil || [])
    stencilCache.set(textDocument.uri, renameme)
    return renameme
}

async function searchStencil(
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<boolean | undefined> {
    const stencil = await stencilCached(textDocument)
    if (stencil === undefined) {
        return undefined
    }

    let skip = 1
    let index = 0

    // Gallop search for the first stencil index that has an end line after the
    // target position. Since we keep stencil ranges in sorted order, we know
    // that we can skip anything before this index.
    while (index < stencil.length && stencil[index].end.line < position.line) {
        const newIndex = index + skip
        skip = newIndex < stencil.length && stencil[newIndex].end.line < position.line ? skip : 1
        index += skip
        skip *= 2
    }

    // Linearly search stencil for a range that includes the target position
    while (index < stencil.length) {
        const { start, end } = stencil[index]
        index++

        if (position.line < start.line) {
            // Since we keep stencil ranges in sorted order, we know that we
            // can skip the remaining range sin the stencil.
            break
        }

        // Do accurate check
        if (new sourcegraph.Range(start.line, start.character, end.line, end.character).contains(position)) {
            return true
        }
    }

    return false
}

/** Retrieve definitions and hover text for the current hover position. */
function definitionAndHover(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (textDocument: sourcegraph.TextDocument, position: sourcegraph.Position) => Promise<DefinitionAndHover | null> {
    return async (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<DefinitionAndHover | null> => {
        if ((await searchStencil(textDocument, position)) === false) {
            return null
        }

        const getDefinitionAndHoverFromRangeRequest = async (): Promise<DefinitionAndHover | null> => {
            if (getRangeFromWindow) {
                const range = await (await getRangeFromWindow)(textDocument, position)
                if (range?.definitions) {
                    const definitions = range.definitions()
                    if (definitions.length > 0 && range?.hover) {
                        return {
                            definition: definitions,
                            hover: hoverPayloadToHover(range.hover),
                        }
                    }
                }
            }

            return null
        }

        // First see if we can query or resolve a window containing this target position. If we've
        // already requested this range, it should be a synchronous return that won't trigger the
        // fallback request. If we don't have the window in memory, wait a very small time for the
        // window to resolve, then fall back to requesting the definition and hover text for this
        // position explicitly.
        return raceWithDelayOffset(
            getDefinitionAndHoverFromRangeRequest(),
            async () => definitionAndHoverForPosition(textDocument, position, queryGraphQL),
            RANGE_RESOLUTION_DELAY_MS
        )
    }
}

/** Retrieve references for the current hover position. */
function references(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
    return async function* (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        const getReferencesFromRangeRequest = async (): Promise<sourcegraph.Location[] | null> => {
            if (getRangeFromWindow) {
                const range = await (await getRangeFromWindow)(textDocument, position)
                if (range?.references) {
                    const references = range.references()
                    if (references.length > 0) {
                        return range.references()
                    }
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
            RANGE_RESOLUTION_DELAY_MS,
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

/** Retrieve references ranges of the current hover position to highlight. */
export function documentHighlights(
    queryGraphQL: QueryGraphQLFn<any>,
    getRangeFromWindow?: Promise<RangeWindowFactoryFn>
): (
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<sourcegraph.DocumentHighlight[] | null> {
    return async (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.DocumentHighlight[] | null> => {
        if (getRangeFromWindow) {
            const range = await (await getRangeFromWindow)(textDocument, position)
            if (range?.references) {
                const references = range?.references()
                if (references.length > 0) {
                    return filterLocationsForDocumentHighlights(textDocument, references)
                }
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
