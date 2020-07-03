import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { nodeToLocation, LocationConnectionNode } from './locations'
import { HoverPayload } from './hover'
import {
    GenericLSIFResponse,
    queryLSIF,
    lsifRequest,
    rangeFragment,
    simpleResourceFragment,
    markdownFragment,
} from './api'

/** The size of the bounds on each window request. */
const WINDOW_SIZE = 100

/** The type returned by makeWindowFactory. */
export type WindowFactoryFn = (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<AggregateCodeIntelligence | null>

/** A range and a subset of its intelligence data. */
export interface AggregateCodeIntelligence {
    range: sourcegraph.Range
    definitions?: sourcegraph.Location[]
    references?: sourcegraph.Location[]
    hover?: HoverPayload
}

/** A set of aggregate code intelligence and the line bounds in which they are contained. */
interface Window {
    startLine: number
    endLine: number
    ranges: Promise<AggregateCodeIntelligence[] | null>
}

/**
 * Create a factory function that returns aggregate code intelligence
 * for the given document and position. This will request bulk data from
 * the GraphQL API (a range around the given position) and cache the result
 * so that similar queries will not have to make a subsequent network
 * request.
 *
 * The data returned from this function is precise but not complete. Notably,
 * it is missing any definitions and references that do not exist in the
 * same bundle. In order to get cross-repository and cross-root intelligence,
 * the provider must fall back to an explicit request for that range when the
 * data here is not sufficient.
 *
 * @param queryGraphQL The function used to query the GraphQL API.
 */
export async function makeWindowFactory(
    queryGraphQL: QueryGraphQLFn<any> = sgQueryGraphQL
): Promise<WindowFactoryFn> {
    if (!(await hasWindowQuery(queryGraphQL))) {
        // No-op if the instance doesn't support bulk loading
        return () => Promise.resolve(null)
    }

    // TODO(efritz) - figure out how when to free space
    const cache = new Map<sourcegraph.TextDocument, Window[]>()

    const getPromise = async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<AggregateCodeIntelligence[] | null> => {
        let windows = cache.get(doc)
        if (!windows) {
            windows = []
            cache.set(doc, windows)
        }

        return findOverlappingWindows(doc, position, windows, queryGraphQL)
    }

    return async (doc, position) =>
        findOverlappingAggregateCodeIntelligence(
            position,
            (await getPromise(doc, position)) || []
        )
}

/**
 * Return the window that contains the given position. If no such window exists,
 * one will be constructed via a GraphQL request and inserted into the given array
 * of windows.
 *
 * This function inserts disjoint windows ordered by their start position so that
 * bounds calculations are efficient and early-out contains conditions are ensured
 * to be correct.
 *
 * @param doc The current document.
 * @param position The target position.
 * @param windows The set of windows known to the document.
 * @param queryGraphQL The function used to query the GraphQL API.
 */
export async function findOverlappingWindows(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    windows: Window[],
    queryGraphQL: QueryGraphQLFn<any> = sgQueryGraphQL
): Promise<AggregateCodeIntelligence[] | null> {
    let index = -1
    for (const window of windows) {
        if (window.startLine > position.line) {
            // Current window begins after this position
            break
        }

        if (position.line <= window.endLine) {
            // The position is within the window bounds
            return window.ranges
        }

        // Current window ends before this position
        index++
    }

    const [startLine, endLine] = calculateWindow(
        position.line,
        // clamp at zero or after the previous context
        index < 0 ? 0 : windows[index].endLine + 1,
        // clamp before the next context, if one exists
        index + 1 < windows.length
            ? windows[index + 1].startLine - 1
            : undefined
    )

    // Query this range and insert it into the current index to keep the
    // array of windows sorted.
    const ranges = rangesInWindow(doc, startLine, endLine, queryGraphQL)
    windows.splice(index + 1, 0, { startLine, endLine, ranges })
    return ranges
}

/**
 * Calculate the start and end line of a window centered around a given position.
 *
 * @param line The target window center.
 * @param lowerBound The minimum lower bound of the window.
 * @param upperBound The maximum upper bound of the window.
 */
export function calculateWindow(
    line: number,
    lowerBound: number,
    upperBound?: number
): [number, number] {
    const radius = WINDOW_SIZE / 2
    const candidateStartLine = line - radius
    const candidateEndLine = line + radius
    const lowerSlack = lowerBound - candidateStartLine
    const upperSlack = candidateEndLine - (upperBound ?? candidateEndLine)
    const startLine = candidateStartLine - Math.max(0, upperSlack)
    const endLine = candidateEndLine + Math.max(0, lowerSlack)

    return [
        Math.max(startLine, lowerBound),
        upperBound ? Math.min(endLine, upperBound) : endLine,
    ]
}

/**
 * Return the aggregate code intelligence that overlaps the given position.
 *
 * @param position The target position.
 * @param ranges The candidate ranges with aggregate code intelligence.
 */
export function findOverlappingAggregateCodeIntelligence(
    position: sourcegraph.Position,
    ranges: AggregateCodeIntelligence[]
): AggregateCodeIntelligence | null {
    return (
        ranges.find(
            ({
                range: {
                    start: { line: startLine, character: startCharacter },
                    end: { line: endLine, character: endCharacter },
                },
            }) =>
                // left side check
                (position.line > startLine ||
                    (position.line === startLine &&
                        position.character >= startCharacter)) &&
                // right side check
                (position.line < endLine ||
                    (position.line === endLine &&
                        position.character <= endCharacter))
        ) || null
    )
}

const introspectionQuery = gql`
    query GitBlobLSIFDataIntrospection() {
        __type(name: "GitBlobLSIFData") {
            fields {
                name
            }
        }
    }
`

interface IntrospectionResponse {
    __type: { fields: { name: string }[] }
}

/** Determine if the LSIF query resolvers have a window function. */
async function hasWindowQuery(
    queryGraphQL: QueryGraphQLFn<IntrospectionResponse> = sgQueryGraphQL
): Promise<boolean> {
    return (await queryGraphQL(introspectionQuery)).__type.fields.some(
        field => field.name === 'window'
    )
}

const windowQuery = gql`
    query Window($repository: String!, $commit: String!, $path: String!, $startLine: Int!, $endLine: Int!) {
        ${lsifRequest(gql`
            window(startLine: $startLine, endLine: $endLine) {
                nodes {
                    ${rangeFragment}
                    definitions {
                        nodes {
                            ${simpleResourceFragment}
                            ${rangeFragment}
                        }
                    }
                    references {
                        nodes {
                            ${simpleResourceFragment}
                            ${rangeFragment}
                        }
                    }
                    hover {
                        ${markdownFragment}
                    }
                }
            `)}
        }
    }
`

/** Retrieve local (same-bundle) code intelligence for symbols between the given lines. */
export async function rangesInWindow(
    doc: sourcegraph.TextDocument,
    startLine: number,
    endLine: number,
    queryGraphQL: QueryGraphQLFn<
        GenericLSIFResponse<WindowResponse | null>
    > = sgQueryGraphQL
): Promise<AggregateCodeIntelligence[] | null> {
    return windowResponseToAggregateCodeIntelligenceNodes(
        doc,
        await queryLSIF(
            { query: windowQuery, uri: doc.uri, startLine, endLine },
            queryGraphQL
        )
    )
}

export interface WindowResponse {
    window: { nodes: AggregateCodeIntelligenceConnectionNode[] }
}

export interface AggregateCodeIntelligenceConnectionNode {
    range: sourcegraph.Range
    definitions?: { nodes: LocationConnectionNode[] }
    references?: { nodes: LocationConnectionNode[] }
    hover?: HoverPayload
}

/**
 * Convert a GraphQL window response into a list of aggregate code intelligence objects.
 *
 * @param doc The current document.
 * @param lsifObj The resolved LSIF object.
 */
export function windowResponseToAggregateCodeIntelligenceNodes(
    doc: sourcegraph.TextDocument,
    lsifObj: WindowResponse | null
): AggregateCodeIntelligence[] | null {
    return (
        lsifObj?.window.nodes.map(node =>
            nodeToAggregateCodeIntelligence(doc, node)
        ) || null
    )
}

/**
 * Convert LSIF response node into a AggregateCodeIntelligence.
 *
 * @param doc The current document.
 * @param node A nav view connection node.
 */
export function nodeToAggregateCodeIntelligence(
    doc: sourcegraph.TextDocument,
    {
        range,
        definitions,
        references,
        hover,
    }: AggregateCodeIntelligenceConnectionNode
): AggregateCodeIntelligence {
    return {
        range,
        definitions: (definitions?.nodes || []).map(node =>
            nodeToLocation(doc, node)
        ),
        references: (references?.nodes || []).map(node =>
            nodeToLocation(doc, node)
        ),
        hover,
    }
}
