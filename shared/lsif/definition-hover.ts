import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { LocationConnectionNode, nodeToLocation } from './locations'
import { GenericLSIFResponse, queryLSIF } from './api'
import { DefinitionAndHover } from '../providers'

export interface DefinitionAndHoverResponse {
    definitions?: {
        nodes: LocationConnectionNode[]
    }
    hover?: HoverPayload
}

export interface HoverPayload {
    markdown: { text: string }
    range: sourcegraph.Range
}

const definitionAndHoverQuery = gql`
    query DefinitionAndHover($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!) {
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

/** Retrieve definitions and hover text for the current hover position. */
export async function definitionAndHoverForPosition(
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<DefinitionAndHoverResponse | null>> = sgQueryGraphQL
): Promise<DefinitionAndHover | null> {
    return definitionAndHoverResponseToLocations(
        textDocument,
        await queryLSIF(
            {
                query: definitionAndHoverQuery,
                uri: textDocument.uri,
                line: position.line,
                character: position.character,
            },
            queryGraphQL
        )
    )
}

/**
 * Convert a GraphQL definition and hover response into an object consisting of a list of Sourcegraph
 * locations and a markdown-formatted hover object.
 *
 * @param lsifObj The resolved LSIF object.
 */
export function definitionAndHoverResponseToLocations(
    textDocument: sourcegraph.TextDocument,
    lsifObject: DefinitionAndHoverResponse | null
): DefinitionAndHover | null {
    if (!lsifObject) {
        return null
    }

    return {
        definition: lsifObject.definitions?.nodes.map(node => nodeToLocation(textDocument, node)) || null,
        hover: lsifObject.hover ? hoverPayloadToHover(lsifObject?.hover) : null,
    }
}

/**
 * Convert a GraphQL Markdown payload into a Sourcegraph hover.
 *
 * @param payload The payload.
 */
export function hoverPayloadToHover(payload: HoverPayload): sourcegraph.Hover {
    return {
        contents: {
            value: payload.markdown.text,
            kind: sourcegraph.MarkupKind.Markdown,
        },
        range: payload.range,
    }
}
