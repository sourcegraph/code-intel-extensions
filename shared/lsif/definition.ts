import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { queryGraphQL as sgQueryGraphQL, QueryGraphQLFn } from '../util/graphql'
import { LocationConnectionNode, nodeToLocation } from './locations'
import {
    GenericLSIFResponse,
    queryLSIF,
    resourceFragment,
    rangeFragment,
    lsifRequest,
} from './api'

export interface DefinitionResponse {
    definitions: {
        nodes: LocationConnectionNode[]
    }
}

const definitionsQuery = gql`
    query Definitions($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!) {
        ${lsifRequest(gql`
            definitions(line: $line, character: $character) {
                nodes {
                    ${resourceFragment}
                    ${rangeFragment}
                }
            }
        `)}
    }
`

/** Retrieve a definition for the current hover position. */
export async function definitionForPosition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    queryGraphQL: QueryGraphQLFn<
        GenericLSIFResponse<DefinitionResponse | null>
    > = sgQueryGraphQL
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
 * Convert a GraphQL definition response into a list of Sourcegraph lcoations.
 *
 * @param lsifObj The resolved LSIF object.
 */
export function definitionResponseToLocations(
    doc: sourcegraph.TextDocument,
    lsifObj: DefinitionResponse | null
): sourcegraph.Location[] | null {
    return (
        lsifObj?.definitions.nodes.map(node => nodeToLocation(doc, node)) ||
        null
    )
}
