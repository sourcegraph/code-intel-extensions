import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { concat } from '../util/ix'
import { nodeToLocation, LocationConnectionNode } from './locations'
import {
    queryLSIF,
    GenericLSIFResponse,
    rangeFragment,
    resourceFragment,
    lsifRequest,
} from './api'

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
    query References($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!, $after: String) {
        ${lsifRequest(gql`
            references(line: $line, character: $character, after: $after) {
                nodes {
                    ${resourceFragment}
                    ${rangeFragment}
                }
                pageInfo {
                    endCursor
                }
            }
        `)}
    }
`

/** Retrieve references for the current hover position. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function* referencesForPosition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    queryGraphQL: QueryGraphQLFn<
        GenericLSIFResponse<ReferencesResponse | null>
    > = sgQueryGraphQL
): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
    const queryPage = async function*(
        requestsRemaining: number,
        after?: string
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        if (requestsRemaining === 0) {
            return
        }

        // Make the request for the page starting at the after cursor
        const { locations, endCursor } = await referencePageForPosition(
            doc,
            position,
            after,
            queryGraphQL
        )

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
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    after: string | undefined,
    queryGraphQL: QueryGraphQLFn<
        GenericLSIFResponse<ReferencesResponse | null>
    > = sgQueryGraphQL
): Promise<{ locations: sourcegraph.Location[] | null; endCursor?: string }> {
    return referenceResponseToLocations(
        doc,
        await queryLSIF(
            {
                query: referencesQuery,
                uri: doc.uri,
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
    doc: sourcegraph.TextDocument,
    lsifObj: ReferencesResponse | null
): { locations: sourcegraph.Location[] | null; endCursor?: string } {
    if (!lsifObj) {
        return { locations: null }
    }

    return {
        locations: lsifObj.references.nodes.map(node =>
            nodeToLocation(doc, node)
        ),
        endCursor: lsifObj.references.pageInfo.endCursor,
    }
}
