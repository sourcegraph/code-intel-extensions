import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { nodeToLocation, LocationConnectionNode } from './locations'
import { HoverPayload } from './hover'
import { GenericLSIFResponse, queryLSIF } from './api'

/** The size of the bounds on each ranges request. */
const RANGE_WINDOW_SIZE = 100

/**
 * The maximum number of documents to store windows for. This value can be
 * relatively low as only the current document really matters. We just want
 * to keep a handful of values around in case the user navigates back to a
 * previous page.
 *
 * Note: Alternatively, we may want to enforce a maximum number of windows
 * that can remain resident in the extension at one time as well. This will
 * make it easier to browse much larger files, but this seems like it is a
 * good enough v1 to stop things from slowing to a crawl in the vast majority
 * of circumstances.
 */
const WINDOW_CACHE_CAPACITY = 5

/** The type returned by makeRangeWindowFactory. */
export type RangeWindowFactoryFn = (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<CodeIntelligenceRange | null>

/** A range and a subset of its intelligence data. */
export interface CodeIntelligenceRange {
    range: sourcegraph.Range
    definitions?: sourcegraph.Location[]
    references?: sourcegraph.Location[]
    hover?: HoverPayload
}

/** A set of code intelligence ranges and the line bounds in which they are contained. */
interface RangeWindow {
    startLine: number
    endLine: number
    ranges: Promise<CodeIntelligenceRange[] | null>
}

/**
 * Create a factory function that returns code intelligence ranges for the given
 * document and position. This will request bulk data from the GraphQL API
 * (a range around the given position) and cache the result so that similar queries
 * will not have to make a subsequent network request.
 *
 * The data returned from this function is precise but not complete. Notably, it is
 * missing any definitions and references that do not exist in the same bundle. In
 * order to get cross-repository and cross-root intelligence, the provider must fall
 * back to an explicit request for that range when the data here is not sufficient.
 *
 * @param queryGraphQL The function used to query the GraphQL API.
 */
export async function makeRangeWindowFactory(
    queryGraphQL: QueryGraphQLFn<any> = sgQueryGraphQL
): Promise<RangeWindowFactoryFn> {
    if (!(await hasRangesQuery(queryGraphQL))) {
        // No-op if the instance doesn't support bulk loading
        return () => Promise.resolve(null)
    }

    const cache = new Map<
        string,
        {
            lasthit: Date
            windows: RangeWindow[]
        }
    >()

    const getPromise = async (
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<CodeIntelligenceRange[] | null> => {
        let cacheEntry = cache.get(textDocument.uri)
        if (!cacheEntry) {
            // Add fresh entry
            cacheEntry = { lasthit: new Date(), windows: [] }
            cache.set(textDocument.uri, cacheEntry)
            // Remove oldest entries to keep the cache under capacity
            while (cache.size > WINDOW_CACHE_CAPACITY) {
                cache.delete(
                    [...cache.entries()].reduce((entry1, entry2) => (entry1[1].lasthit < entry2[1].lasthit ? entry1 : entry2))[0]
                )
            }
        } else {
            // Keep track of recency
            cacheEntry.lasthit = new Date()
        }

        return findOverlappingWindows(textDocument, position, cacheEntry?.windows || [], queryGraphQL)
    }

    return async (textDocument, position) =>
        findOverlappingCodeIntelligenceRange(position, (await getPromise(textDocument, position)) || [])
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
 * @param rangeWindows The set of windows known to the document.
 * @param queryGraphQL The function used to query the GraphQL API.
 */
export async function findOverlappingWindows(
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    rangeWindows: RangeWindow[],
    queryGraphQL: QueryGraphQLFn<any> = sgQueryGraphQL
): Promise<CodeIntelligenceRange[] | null> {
    let index = -1
    for (const rangeWindow of rangeWindows) {
        if (rangeWindow.startLine > position.line) {
            // Current window begins after this position
            break
        }

        if (position.line < rangeWindow.endLine) {
            // The position is within the window bounds
            return rangeWindow.ranges
        }

        // Current window ends before this position
        index++
    }

    const [startLine, endLine] = calculateRangeWindow(
        position.line,
        // clamp at zero or after the previous context
        index < 0 ? 0 : rangeWindows[index].endLine,
        // clamp before the next context, if one exists
        index + 1 < rangeWindows.length ? rangeWindows[index + 1].startLine : undefined
    )

    // Query this range and insert it into the current index to keep the
    // array of windows sorted.
    const ranges = rangesInRangeWindow(textDocument, startLine, endLine, queryGraphQL)
    rangeWindows.splice(index + 1, 0, { startLine, endLine, ranges })
    return ranges
}

/**
 * Calculate the start and end line of a window centered around a given position.
 *
 * @param line The target window center.
 * @param lowerBound The minimum lower bound of the window.
 * @param upperBound The maximum upper bound of the window.
 */
export function calculateRangeWindow(line: number, lowerBound: number, upperBound?: number): [number, number] {
    const radius = RANGE_WINDOW_SIZE / 2
    const candidateStartLine = line - radius
    const candidateEndLine = line + radius
    const lowerSlack = lowerBound - candidateStartLine
    const upperSlack = candidateEndLine - (upperBound ?? candidateEndLine)
    const startLine = candidateStartLine - Math.max(0, upperSlack)
    const endLine = candidateEndLine + Math.max(0, lowerSlack)

    return [Math.max(startLine, lowerBound), upperBound ? Math.min(endLine, upperBound) : endLine]
}

/**
 * Return the code intelligence range that overlaps the given position.
 *
 * @param position The target position.
 * @param ranges The candidate ranges with aggregate code intelligence.
 */
export function findOverlappingCodeIntelligenceRange(
    position: sourcegraph.Position,
    ranges: CodeIntelligenceRange[]
): CodeIntelligenceRange | null {
    const overlapping =
        ranges.filter(
            ({
                range: {
                    start: { line: startLine, character: startCharacter },
                    end: { line: endLine, character: endCharacter },
                },
            }) =>
                // left side check
                (position.line > startLine || (position.line === startLine && position.character >= startCharacter)) &&
                // right side check
                (position.line < endLine || (position.line === endLine && position.character < endCharacter))
        ) || null

    if (overlapping.length === 0) {
        return null
    }

    overlapping.sort((a, b) => {
        const cmp = b.range.start.line - a.range.start.line
        if (cmp === 0) {
            return b.range.start.character - a.range.start.character
        }

        return cmp
    })

    return overlapping[0]
}

const introspectionQuery = gql`
    query GitBlobLSIFDataIntrospection {
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

/** Determine if the LSIF query resolvers have a ranges function. */
async function hasRangesQuery(queryGraphQL: QueryGraphQLFn<IntrospectionResponse> = sgQueryGraphQL): Promise<boolean> {
    return (await queryGraphQL(introspectionQuery)).__type.fields.some(field => field.name === 'ranges')
}

const rangesQuery = gql`
    query Ranges($repository: String!, $commit: String!, $path: String!, $startLine: Int!, $endLine: Int!) {
        repository(name: $repository) {
            commit(rev: $commit) {
                blob(path: $path) {
                    lsif {
                        ranges(startLine: $startLine, endLine: $endLine) {
                            nodes {
                                range {
                                    start {
                                        line
                                        character
                                    }
                                    end {
                                        line
                                        character
                                    }
                                }
                                definitions {
                                    nodes {
                                        resource {
                                            path
                                        }
                                        range {
                                            start {
                                                line
                                                character
                                            }
                                            end {
                                                line
                                                character
                                            }
                                        }
                                    }
                                }
                                references {
                                    nodes {
                                        resource {
                                            path
                                        }
                                        range {
                                            start {
                                                line
                                                character
                                            }
                                            end {
                                                line
                                                character
                                            }
                                        }
                                    }
                                }
                                hover {
                                    markdown {
                                        text
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

/** Retrieve local (same-bundle) code intelligence for symbols between the given lines. */
export async function rangesInRangeWindow(
    textDocument: sourcegraph.TextDocument,
    startLine: number,
    endLine: number,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<RangesResponse | null>> = sgQueryGraphQL
): Promise<CodeIntelligenceRange[] | null> {
    return rangesResponseToCodeIntelligenceRangeNodes(
        textDocument,
        await queryLSIF({ query: rangesQuery, uri: textDocument.uri, startLine, endLine }, queryGraphQL)
    )
}

export interface RangesResponse {
    ranges: { nodes: CodeIntelligenceRangeConnectionNode[] }
}

export interface CodeIntelligenceRangeConnectionNode {
    range: sourcegraph.Range
    definitions?: { nodes: LocationConnectionNode[] }
    references?: { nodes: LocationConnectionNode[] }
    hover?: HoverPayload
}

/**
 * Convert a GraphQL ranges response into a list of code intelligence ranges.
 *
 * @param doc The current document.
 * @param lsifObj The resolved LSIF object.
 */
export function rangesResponseToCodeIntelligenceRangeNodes(
    textDocument: sourcegraph.TextDocument,
    lsifObject: RangesResponse | null
): CodeIntelligenceRange[] | null {
    return lsifObject?.ranges.nodes.map(node => nodeToCodeIntelligenceRange(textDocument, node)) || null
}

/**
 * Convert LSIF response node into a CodeIntelligenceRange.
 *
 * @param doc The current document.
 * @param node A code intelligence range connection node.
 */
export function nodeToCodeIntelligenceRange(
    textDocument: sourcegraph.TextDocument,
    { range, definitions, references, hover }: CodeIntelligenceRangeConnectionNode
): CodeIntelligenceRange {
    return {
        range,
        definitions: (definitions?.nodes || []).map(node => nodeToLocation(textDocument, node)),
        references: (references?.nodes || []).map(node => nodeToLocation(textDocument, node)),
        hover,
    }
}
