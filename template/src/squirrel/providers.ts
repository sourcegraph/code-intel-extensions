import { once } from 'lodash'
import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'

import { Providers } from '../providers'
import { cache } from '../util'
import { API } from '../util/api'
import { queryGraphQL } from '../util/graphql'
import { parseGitURI } from '../util/uri'

export function createProviders(): Providers {
    const fetchPayloadCached = cache(fetchPayload, { max: 10 })
    const hasLocalCodeIntelField = once(() => new API().hasLocalCodeIntelField())

    return {
        async *definition(document, position) {
            if (!(await hasLocalCodeIntelField())) {
                return
            }

            const { repo, commit, path } = parseGitURI(new URL(document.uri))

            const payload = await fetchPayloadCached({ repo, commit, path })
            if (!payload) {
                return
            }

            for (const symbol of payload.symbols) {
                const defLocation = mkSourcegraphLocation({
                    repo,
                    commit,
                    path,
                    ...symbol.def,
                })

                if (isInRange(position, symbol.def)) {
                    yield defLocation
                    return
                }

                for (const reference of symbol.refs) {
                    if (isInRange(position, reference)) {
                        yield defLocation
                        return
                    }
                }
            }
        },
        async *references(document, position) {
            if (!(await hasLocalCodeIntelField())) {
                return
            }

            const { repo, commit, path } = parseGitURI(new URL(document.uri))

            const payload = await fetchPayloadCached({ repo, commit, path })
            if (!payload) {
                return
            }

            for (const symbol of payload.symbols) {
                const referenceLocations = symbol.refs.map(reference =>
                    mkSourcegraphLocation({
                        repo,
                        commit,
                        path,
                        ...reference,
                    })
                )

                if (isInRange(position, symbol.def)) {
                    yield referenceLocations
                    return
                }

                for (const reference of symbol.refs) {
                    if (isInRange(position, reference)) {
                        yield referenceLocations
                    }
                }
            }
        },
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async *hover() {},
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async *documentHighlights() {},
    }
}

const fetchPayload = async ({ repo, commit, path }: RepoCommitPath): Promise<LocalCodeIntelPayload | undefined> => {
    const vars = { repository: repo, commit, path }
    const response = await queryGraphQL<LocalCodeIntelResponse>(localCodeIntelQuery, vars)

    const payloadString = response?.repository?.commit?.blob?.localCodeIntel
    if (!payloadString) {
        return undefined
    }

    return JSON.parse(payloadString) as LocalCodeIntelPayload
}

const isInRange = (position: sourcegraph.Position, range: Range): boolean => {
    if (position.line !== range.row) {
        return false
    }
    if (position.character < range.column) {
        return false
    }
    if (position.character > range.column + range.length) {
        return false
    }
    return true
}

interface RepoCommitPath {
    repo: string
    commit: string
    path: string
}

interface LocalCodeIntelPayload {
    symbols: LocalSymbol[]
}

interface LocalSymbol {
    hover?: string
    def: Range
    refs: Range[]
}

interface Range {
    row: number
    column: number
    length: number
}

type RepoCommitPathRange = RepoCommitPath & Range

const mkSourcegraphLocation = ({
    repo,
    commit,
    path,
    row,
    column,
    length,
}: RepoCommitPathRange): sourcegraph.Location => ({
    uri: new URL(`git://${repo}?${commit}#${path}`),
    range: new sourcegraph.Range(row, column, row, column + length),
})

/** The response envelope for all blob queries. */
export interface GenericBlobResponse<R> {
    repository: { commit: { blob: R | null } | null } | null
}

type LocalCodeIntelResponse = GenericBlobResponse<{ localCodeIntel: string }>

const localCodeIntelQuery = gql`
    query LocalCodeIntel($repository: String!, $commit: String!, $path: String!) {
        repository(name: $repository) {
            commit(rev: $commit) {
                blob(path: $path) {
                    localCodeIntel
                }
            }
        }
    }
`
