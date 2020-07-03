import gql from 'tagged-template-noop'
import { QueryGraphQLFn } from '../util/graphql'
import { parseGitURI } from '../util/uri'

/** The response envelope for all LSIF queries. */
export interface GenericLSIFResponse<R> {
    repository: {
        commit: {
            blob: {
                lsif: R
            }
        }
    }
}

/**
 * Envelopes an LSIF resolver request.
 *
 * @param inner The GraphQL fragment inside of the lsif resolver.
 */
export const lsifRequest = (inner: string): string => gql`
    repository(name: $repository) {
        commit(rev: $commit) {
            blob(path: $path) {
                lsif {
                    ${inner}
                }
            }
        }
    }
`

export const resourceFragment = gql`
    resource {
        path
        repository {
            name
        }
        commit {
            oid
        }
    }
`

export const simpleResourceFragment = gql`
    resource {
        path
    }
`

export const rangeFragment = gql`
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
`

export const markdownFragment = gql`
    markdown {
        text
    }
`

/**
 * Perform an LSIF request to the GraphQL API.
 *
 * @param args Parameter bag.
 * @param queryGraphQL The function used to query the GraphQL API.
 */
export async function queryLSIF<P extends { query: string; uri: string }, R>(
    {
        /** The GraphQL request query. */
        query,
        /** The current text document uri. */
        uri,
        /** Additional query parameters. */
        ...rest
    }: P,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<R>>
): Promise<R | null> {
    const { repo, commit, path } = parseGitURI(new URL(uri))
    const queryArgs = { repository: repo, commit, path, ...rest }
    const data = await queryGraphQL(query, queryArgs)
    return data.repository.commit.blob.lsif
}
