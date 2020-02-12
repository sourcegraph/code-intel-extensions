import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { Providers } from '../providers'
import { queryGraphQL } from '../util/graphql'
import { asyncGeneratorFromPromise } from '../util/ix'
import { parseGitURI } from '../util/uri'
import { LocationConnectionNode, nodeToLocation } from './conversion'

/**
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the GraphQL API.
 */
export function createProviders(): Providers {
    return {
        definition: asyncGeneratorFromPromise(definition),
        references: asyncGeneratorFromPromise(references),
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

    const lsifObj = await queryLSIF<Response>({ doc, position, query })
    return lsifObj?.definitions.nodes.map(nodeToLocation) || null
}

/**
 * Retrieve references for the current hover position.
 *
 * @param doc The current text document.
 * @param position The current hover position.
 */
async function references(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Location[] | null> {
    const query = `
        query References($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!) {
            repository(name: $repository) {
                commit(rev: $commit) {
                    blob(path: $path) {
                        lsif {
                            references(line: $line, character: $character) {
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
        references: { nodes: LocationConnectionNode[] }
    }

    const lsifObj = await queryLSIF<Response>({ doc, position, query })
    return lsifObj?.references.nodes.map(nodeToLocation) || null
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

    const lsifObj = await queryLSIF<Response>({
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
async function queryLSIF<T>({
    doc,
    position,
    query,
}: {
    /** The current text document. */
    doc: sourcegraph.TextDocument
    /** The current hover position. */
    position: lsp.Position
    /** The GraphQL request query. */
    query: string
}): Promise<T | null> {
    interface Response {
        repository: {
            commit: {
                blob: {
                    lsif: T | null
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
    })

    return data.repository.commit.blob.lsif
}
