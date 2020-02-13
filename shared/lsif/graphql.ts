import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { Providers } from '../providers'
import { queryGraphQL } from '../util/graphql'
import { asyncGeneratorFromPromise, concat } from '../util/ix'
import { parseGitURI } from '../util/uri'
import { LocationConnectionNode, nodeToLocation } from './conversion'

/**
 * The maximum number of chained GraphQL requests to make for a single
 * requests query. The page count for a result set should generally be
 * relatively low unless it's a VERY popular library and LSIF data is
 * ubiquitous (which is our goal).
 */
const MAX_REFERENCE_PAGE_REQUESTS = 20

/**
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the GraphQL API.
 */
export function createProviders(): Providers {
    return {
        definition: asyncGeneratorFromPromise(definition),
        references,
        hover: asyncGeneratorFromPromise(hover),
    }
}

/**
 * Retrieve a definition for the current hover position.
 *
 * @param doc The current text document.
 * @param position The current hover position.
 */
async function definition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Definition> {
    const query = `
        query Definitions($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!) {
            repository(name: $repository) {
                commit(rev: $commit) {
                    blob(path: $path) {
                        lsif {
                            definitions(line: $line, character: $character) {
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

    interface Response {
        definitions: { nodes: LocationConnectionNode[] }
    }

    const lsifObj: Response | null = await queryLSIF({ doc, position, query })
    return lsifObj?.definitions.nodes.map(nodeToLocation) || null
}

/**
 * Retrieve references for the current hover position.
 *
 * @param doc The current text document.
 * @param position The current hover position.
 */
async function* references(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
    const query = `
        query References($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!, $after: String) {
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

    interface Response {
        references: {
            nodes: LocationConnectionNode[]
            pageInfo: {
                endCursor: string
            }
        }
    }

    const queryPage = async function*(
        requestsRemaining: number,
        after?: string
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        if (requestsRemaining === 0) {
            return
        }

        // Make the request for the page starting at the after cursor
        const lsifObj: Response | null = await queryLSIF({
            doc,
            position,
            query,
            after,
        })
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

/**
 * Retrieve hover text for the current hover position.
 *
 * @param doc The current text document.
 * @param position The current hover position.
 */
async function hover(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Hover | null> {
    const query = `
        query Hover($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!) {
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

    interface Response {
        hover: { markdown: { text: string }; range: sourcegraph.Range }
    }

    const lsifObj: Response | null = await queryLSIF({
        doc,
        position,
        query,
    })

    if (!lsifObj) {
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

/**
 * Perform an LSIF request to the GraphQL API.
 *
 * @param args Parameter bag.
 */
async function queryLSIF<
    P extends {
        doc: sourcegraph.TextDocument
        position: lsp.Position
        query: string
    },
    R
>({
    /** The current text document. */
    doc,
    /** The current hover position. */
    position,
    /** The GraphQL request query. */
    query,
    /** Additional query parameters. */
    ...rest
}: P): Promise<R | null> {
    interface Response {
        repository: {
            commit: {
                blob: {
                    lsif: R | null
                }
            }
        }
    }

    const { repo, commit, path } = parseGitURI(new URL(doc.uri))

    const data = await queryGraphQL<Response>(query, {
        repository: repo,
        commit,
        path,
        line: position.line,
        character: position.character,
        ...rest,
    })

    return data.repository.commit.blob.lsif
}
