import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { LocationConnectionNode, nodeToLocation } from './locations'
import { GenericLSIFResponse, queryLSIF } from './api'

export interface DefinitionResponse {
    definitions: {
        nodes: LocationConnectionNode[]
    }
}

const definitionsQuery = gql`
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

/** Retrieve a definition for the current hover position. */
export async function definitionForPosition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    queryGraphQL: QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>> = sgQueryGraphQL
): Promise<sourcegraph.Definition> {
    return definitionResponseToLocations(
        doc,
        await queryLSIF(
            {
                query: definitionsQuery,
                uri: doc.uri,
                line: position.line,
                character: position.character,
            },
            queryGraphQL
        )
    )
}

/**
 * Convert a GraphQL definition response into a list of Sourcegraph locations.
 *
 * @param lsifObj The resolved LSIF object.
 */
export function definitionResponseToLocations(
    doc: sourcegraph.TextDocument,
    lsifObj: DefinitionResponse | null
): sourcegraph.Location[] | null {
    return lsifObj?.definitions.nodes.map(node => nodeToLocation(doc, node)) || null
}
