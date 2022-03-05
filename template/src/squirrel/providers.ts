import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'

import { Providers } from '../providers'
import { queryGraphQL } from '../util/graphql'
import { parseGitURI } from '../util/uri'

export function createProviders(): Providers {
    return {
        async *definition(document, position) {
            const { repo, commit, path } = parseGitURI(new URL(document.uri))

            const location = await queryGraphQL<Response<Definition>>(squirrelDefinitionGql, {
                location: {
                    repo,
                    commit,
                    path,
                    row: position.line,
                    column: position.character,
                },
            })

            if (!location.squirrel.definition) {
                return
            }

            yield squirrelLocationToSourcegraphLocation(location.squirrel.definition)
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async *references() {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async *hover() {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async *documentHighlights() {},
    }
}

interface Response<T> {
    squirrel: T
}

interface Definition {
    definition: SquirrelLocation | null
}

interface SquirrelLocation {
    repo: string
    commit: string
    path: string
    row: number
    column: number
}

const squirrelLocationToSourcegraphLocation = ({
    repo,
    commit,
    path,
    row,
    column,
}: SquirrelLocation): sourcegraph.Location => ({
    uri: new URL(`git://${repo}?${commit}#${path}`),
    range: new sourcegraph.Range(row, column, row, column),
})

const squirrelDefinitionGql = gql`
    query SquirrelDefinition($location: SquirrelLocationInput!) {
        squirrel {
            definition(location: $location) {
                repo
                commit
                path
                row
                column
            }
        }
    }
`
