import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import * as lsp from 'vscode-languageserver-protocol'
import { Providers } from '../providers'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { asyncGeneratorFromPromise, concat } from '../util/ix'
import { parseGitURI } from '../util/uri'
import { LocationConnectionNode, nodeToLocation } from './conversion'

/**
 * The maximum number of chained GraphQL requests to make for a single
 * requests query. The page count for a result set should generally be
 * relatively low unless it's a VERY popular library and LSIF data is
 * ubiquitous (which is our goal).
 */
export const MAX_REFERENCE_PAGE_REQUESTS = 10

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
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the GraphQL API.
 *
 * @param queryGraphQL The function used to query the GraphQL API.
 */
export function createProviders(
    queryGraphQL: QueryGraphQLFn<any> = sgQueryGraphQL
): Providers {
    return {
        definition: asyncGeneratorFromPromise(definition(queryGraphQL)),
        references: references(queryGraphQL),
        hover: asyncGeneratorFromPromise(hover(queryGraphQL)),
    }
}

export interface DefinitionResponse {
    definitions: { nodes: LocationConnectionNode[] }
}

/** Retrieve a definition for the current hover position. */
function definition(
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>
): (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<sourcegraph.Definition> {
    return async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Definition> => {
        const query = gql`
            query Definitions(
                $repository: String!
                $commit: String!
                $path: String!
                $line: Int!
                $character: Int!
            ) {
                repository(name: $repository) {
                    commit(rev: $commit) {
                        blob(path: $path) {
                            lsif {
                                definitions(
                                    line: $line
                                    character: $character
                                ) {
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
                                }
                            }
                        }
                    }
                }
            }
        `

        const lsifObj: DefinitionResponse | null = await queryLSIF(
            { doc, position, query },
            queryGraphQL
        )
        return lsifObj?.definitions.nodes.map(nodeToLocation) || null
    }
}

export interface ReferencesResponse {
    references: {
        nodes: LocationConnectionNode[]
        pageInfo: {
            endCursor?: string
        }
    }
}

/** Retrieve references for the current hover position. */
function references(
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>
): (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
    // eslint-disable-next-line @typescript-eslint/require-await
    return async function*(
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        const query = gql`
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
                                references(
                                    line: $line
                                    character: $character
                                    after: $after
                                ) {
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

        const queryPage = async function*(
            requestsRemaining: number,
            after?: string
        ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
            if (requestsRemaining === 0) {
                return
            }

            // Make the request for the page starting at the after cursor
            const lsifObj: ReferencesResponse | null = await queryLSIF(
                {
                    doc,
                    position,
                    query,
                    after,
                },
                queryGraphQL
            )
            if (!lsifObj) {
                return
            }

            const {
                references: {
                    nodes,
                    pageInfo: { endCursor },
                },
            } = lsifObj

            // Yield this page's set of results
            yield nodes.map(nodeToLocation)

            if (endCursor) {
                // Recursively yield the remaining pages
                yield* queryPage(requestsRemaining - 1, endCursor)
            }
        }

        yield* concat(queryPage(MAX_REFERENCE_PAGE_REQUESTS))
    }
}

export interface HoverResponse {
    hover?: { markdown: { text: string }; range: sourcegraph.Range }
}

/** Retrieve hover text for the current hover position. */
function hover(
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>
): (
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
) => Promise<sourcegraph.Hover | null> {
    return async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Hover | null> => {
        const query = gql`
            query Hover(
                $repository: String!
                $commit: String!
                $path: String!
                $line: Int!
                $character: Int!
            ) {
                repository(name: $repository) {
                    commit(rev: $commit) {
                        blob(path: $path) {
                            lsif {
                                hover(line: $line, character: $character) {
                                    markdown {
                                        text
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
                        }
                    }
                }
            }
        `

        const lsifObj: HoverResponse | null = await queryLSIF(
            {
                doc,
                position,
                query,
            },
            queryGraphQL
        )

        if (!lsifObj || !lsifObj.hover) {
            return null
        }

        return {
            contents: {
                value: lsifObj.hover.markdown.text,
                kind: sourcegraph.MarkupKind.Markdown,
            },
            range: lsifObj.hover.range,
        }
    }
}

/**
 * Perform an LSIF request to the GraphQL API.
 *
 * @param args Parameter bag.
 * @param queryGraphQL The function used to query the GraphQL API.
 */
async function queryLSIF<
    P extends {
        doc: sourcegraph.TextDocument
        position: lsp.Position
        query: string
    },
    R
>(
    {
        /** The current text document. */
        doc,
        /** The current hover position. */
        position,
        /** The GraphQL request query. */
        query,
        /** Additional query parameters. */
        ...rest
    }: P,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<R>>
): Promise<R | null> {
    const { repo, commit, path } = parseGitURI(new URL(doc.uri))
    const queryArgs = {
        repository: repo,
        commit,
        path,
        line: position.line,
        character: position.character,
        ...rest,
    }

    const data = await queryGraphQL(query, queryArgs)
    return data.repository.commit.blob.lsif
}
