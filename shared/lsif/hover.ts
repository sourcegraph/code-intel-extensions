import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { GenericLSIFResponse, queryLSIF } from './api'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'

export interface HoverResponse {
    hover?: HoverPayload
}

export interface HoverPayload {
    markdown: { text: string }
    range: sourcegraph.Range
}

const hoverQuery = gql`
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

/** Retrieve hover text for the current hover position. */
export async function hoverForPosition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>> = sgQueryGraphQL
): Promise<sourcegraph.Hover | null> {
    return hoverResponseToHover(
        await queryLSIF(
            {
                query: hoverQuery,
                uri: doc.uri,
                line: position.line,
                character: position.character,
            },
            queryGraphQL
        )
    )
}

/**
 * Convert a GraphQL hover response into a Sourcegraph hover.
 *
 * @param lsifObj The resolved LSIF object.
 */
export function hoverResponseToHover(lsifObj: HoverResponse | null): sourcegraph.Hover | null {
    return hoverPayloadToHover(lsifObj?.hover || null)
}

/**
 * Convert a GraphQL Markdown payload into a Sourcegraph hover.
 *
 * @param payload The payload.
 */
export function hoverPayloadToHover(payload: HoverPayload | null): sourcegraph.Hover | null {
    if (!payload) {
        return null
    }

    return {
        contents: {
            value: payload.markdown.text,
            kind: sourcegraph.MarkupKind.Markdown,
        },
        range: payload.range,
    }
}
