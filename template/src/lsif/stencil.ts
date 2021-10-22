import sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'

import { QueryGraphQLFn, queryGraphQL as sgQueryGraphQL } from '../util/graphql'

import { GenericLSIFResponse, queryLSIF } from './api'

export const stencil = async (
    textDocument: sourcegraph.TextDocument,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<{ stencil: sourcegraph.Range[] }>> = sgQueryGraphQL
): Promise<sourcegraph.Range[] | undefined> =>
    (
        await queryLSIF(
            {
                query: stencilQuery,
                uri: textDocument.uri,
            },
            queryGraphQL
        )
    )?.stencil

const stencilQuery = gql`
    query Stencil($repository: String!, $commit: String!, $path: String!) {
        repository(name: $repository) {
            commit(rev: $commit) {
                blob(path: $path) {
                    lsif {
                        stencil {
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
            }
        }
    }
`
