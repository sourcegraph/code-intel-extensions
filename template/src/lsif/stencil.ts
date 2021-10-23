import sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import LRU from 'lru-cache'

import { QueryGraphQLFn, queryGraphQL as sgQueryGraphQL } from '../util/graphql'

import { GenericLSIFResponse, queryLSIF } from './api'

export const stencil = async (
    uri: string,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<{ stencil: sourcegraph.Range[] }>> = sgQueryGraphQL
): Promise<sourcegraph.Range[] | undefined> =>
    (
        await queryLSIF(
            {
                query: stencilQuery,
                uri,
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

const cache = <K, V>(func: (k: K) => V, cacheOptions?: LRU.Options<K, V>): ((k: K) => V) => {
    const lru = new LRU<K, V>(cacheOptions)
    return key => {
        if (lru.has(key)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return lru.get(key)!
        }
        const value = func(key)
        lru.set(key, value)
        return value
    }
}

export type StencilFn = (uri: string) => Promise<sourcegraph.Range[] | undefined>

export const makeStencilFn = (
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<{ stencil: sourcegraph.Range[] }>>
): StencilFn => cache(uri => stencil(uri, queryGraphQL), { max: 10 })
