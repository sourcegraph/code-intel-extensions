import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'

import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { concat } from '../util/ix'

import { queryLSIF, GenericLSIFResponse } from './api'
import { nodeToLocation, LocationConnectionNode } from './locations'

/**
 * The maximum number of chained GraphQL requests to make for a single
 * requests query. The page count for a result set should generally be
 * relatively low unless it's a VERY popular library and LSIF data is
 * ubiquitous (which is our goal).
 */
export const MAX_REFERENCE_PAGE_REQUESTS = 10

export interface ReferencesResponse {
    references: {
        nodes: LocationConnectionNode[]
        pageInfo: { endCursor?: string }
    }
}

const referencesQuery = gql`
    query References(
        $repository: String!
        $commit: String!
        $path: String!
        $line: Int!
        $character: Int!
        $after: String
    ) {
        repository(name: $repository) {
            commit(rev: $commit) {
                blob(path: $path) {
                    lsif {
                        references(line: $line, character: $character, after: $after) {
                            nodes {
                                resource {
                                    path
                                    repository {
                                        name
                                    }
                                    commit {
                                        oid
                                    }
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
                            pageInfo {
                                endCursor
                            }
                        }
                    }
                }
            }
        }
    }
`

/** Retrieve references for the current hover position. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function* referencesForPosition(
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>> = sgQueryGraphQL
): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
    const queryPage = async function* (
        requestsRemaining: number,
        after?: string
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        if (requestsRemaining === 0) {
            return
        }

        // Make the request for the page starting at the after cursor
        const { locations, endCursor } = await referencePageForPosition(textDocument, position, after, queryGraphQL)

        // Yield this page's set of results
        yield locations

        if (endCursor) {
            // Recursively yield the remaining pages
            yield* queryPage(requestsRemaining - 1, endCursor)
        }
    }

    yield* concat(queryPage(MAX_REFERENCE_PAGE_REQUESTS))
}

/** Retrieve a single page of references for the current hover position. */
export async function referencePageForPosition(
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    after: string | undefined,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>> = sgQueryGraphQL
): Promise<{ locations: sourcegraph.Location[] | null; endCursor?: string }> {
    return referenceResponseToLocations(
        textDocument,
        await queryLSIF(
            {
                query: referencesQuery,
                uri: textDocument.uri,
                after,
                line: position.line,
                character: position.character,
            },
            queryGraphQL
        )
    )
}

/**
 * Convert a GraphQL reference response into a set of Sourcegraph locations and end cursor.
 *
 * @param doc The current document.
 * @param lsifObj The resolved LSIF object.
 */
export function referenceResponseToLocations(
    textDocument: sourcegraph.TextDocument,
    lsifObject: ReferencesResponse | null
): { locations: sourcegraph.Location[] | null; endCursor?: string } {
    if (!lsifObject) {
        return { locations: null }
    }

    return {
        locations: lsifObject.references.nodes.map(node => nodeToLocation(textDocument, node)),
        endCursor: lsifObject.references.pageInfo.endCursor,
    }
}
