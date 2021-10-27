import sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'

import { QueryGraphQLFn, queryGraphQL as sgQueryGraphQL } from '../util/graphql'

import { GenericLSIFResponse, queryLSIF } from './api'
import { cache } from './util'

export const stencil = async (
    uri: string,
    hasStencilSupport: () => Promise<boolean>,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<{ stencil: sourcegraph.Range[] }>> = sgQueryGraphQL
): Promise<sourcegraph.Range[] | undefined> => {
    if (!(await hasStencilSupport())) {
        return undefined
    }

    const response = await queryLSIF({ query: stencilQuery, uri }, queryGraphQL)
    return response?.stencil
}

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

export type StencilFn = (uri: string) => Promise<sourcegraph.Range[] | undefined>

export const makeStencilFn = (
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<{ stencil: sourcegraph.Range[] }>>,
    hasStencilSupport: () => Promise<boolean> = () => Promise.resolve(true)
): StencilFn => cache(uri => stencil(uri, hasStencilSupport, queryGraphQL), { max: 10 })
