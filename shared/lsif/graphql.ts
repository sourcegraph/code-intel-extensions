import * as sourcegraph from 'sourcegraph'
import { LSIFProviders } from './providers'
import * as LSP from 'vscode-languageserver-types'
import { queryGraphQL } from '../graphql'
import { repositoryFromDoc, commitFromDoc, pathFromDoc } from './util'
import { LocationConnectionNode, nodeToLocation } from './lsif-conversion'

export function initGraphQL(): LSIFProviders {
    const noLSIFData = new Set<string>()

    const cacheUndefined = <T>(
        f: (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ) => Promise<T | undefined>
    ) => async (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<T | undefined> => {
        if (!sourcegraph.configuration.get().get('codeIntel.lsif')) {
            console.log('LSIF is not enabled in global settings')
            return undefined
        }

        if (noLSIFData.has(doc.uri)) {
            return undefined
        }

        const result = await f(doc, pos)
        if (result === undefined) {
            noLSIFData.add(doc.uri)
        }

        return result
    }

    return {
        definition: cacheUndefined(definitionGraphQL),
        references: cacheUndefined(referencesGraphQL),
        hover: cacheUndefined(hoverGraphQL),
    }
}

async function definitionGraphQL(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Definition | undefined> {
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

    const lsifObj = await queryLSIFGraphQL<{
        definitions: { nodes: LocationConnectionNode[] }
    }>({ doc, query, position })

    if (!lsifObj) {
        return undefined
    }

    return lsifObj.definitions.nodes.map(nodeToLocation)
}

async function referencesGraphQL(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Location[] | undefined> {
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

    const lsifObj = await queryLSIFGraphQL<{
        references: { nodes: LocationConnectionNode[] }
    }>({ doc, query, position })

    if (!lsifObj) {
        return undefined
    }

    return lsifObj.references.nodes.map(nodeToLocation)
}

async function hoverGraphQL(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Hover | undefined> {
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

    const lsifObj = await queryLSIFGraphQL<{
        hover: { markdown: { text: string }; range: sourcegraph.Range }
    }>({
        doc,
        query,
        position,
    })

    if (!lsifObj) {
        return undefined
    }

    return {
        contents: {
            value: lsifObj.hover.markdown.text,
            kind: sourcegraph.MarkupKind.Markdown,
        },
        range: lsifObj.hover.range,
    }
}

async function queryLSIFGraphQL<T>({
    doc,
    query,
    position,
}: {
    doc: sourcegraph.TextDocument
    query: string
    position: LSP.Position
}): Promise<T | undefined> {
    repositoryFromDoc(doc)
    commitFromDoc(doc)

    const vars = {
        repository: repositoryFromDoc(doc),
        commit: commitFromDoc(doc),
        path: pathFromDoc(doc),
        line: position.line,
        character: position.character,
    }

    const respObj: {
        data: {
            repository: {
                commit: {
                    blob: {
                        lsif: T
                    }
                }
            }
        }
        errors: Error[]
    } = await queryGraphQL({
        query,
        vars,
        sourcegraph,
    })

    if (respObj.errors) {
        const asError = (err: { message: string }): Error =>
            Object.assign(new Error(err.message), err)

        if (respObj.errors.length === 1) {
            throw asError(respObj.errors[0])
        }

        throw Object.assign(
            new Error(respObj.errors.map(e => e.message).join('\n')),
            {
                name: 'AggregateError',
                errors: respObj.errors.map(asError),
            }
        )
    }

    return respObj.data.repository.commit.blob.lsif
}
