import { once } from 'lodash'
import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'

import { PromiseProviders } from '../providers'
import { cache } from '../util'
import { API } from '../util/api'
import { queryGraphQL } from '../util/graphql'
import { parseGitURI } from '../util/uri'

export const mkSquirrel = (): PromiseProviders => {
    const fetchPayloadCached = cache(fetchPayload, { max: 10 })
    const hasLocalCodeIntelField = once(() => new API().hasLocalCodeIntelField())

    const findSymbol = async (
        document: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<LocalSymbol | undefined> => {
        if (!(await hasLocalCodeIntelField())) {
            return
        }

        const { repo, commit, path } = parseGitURI(new URL(document.uri))

        const payload = await fetchPayloadCached({ repo, commit, path })
        if (!payload) {
            return
        }

        for (const symbol of payload.symbols) {
            if (symbol.def && isInRange(position, symbol.def)) {
                return symbol
            }

            for (const reference of symbol.refs ?? []) {
                if (isInRange(position, reference)) {
                    return symbol
                }
            }
        }

        return undefined
    }

    const fetchSymbolInfo = async (
        document: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<SymbolInfo | undefined> => {
        if (!(await hasLocalCodeIntelField())) {
            return
        }

        const { repo, commit, path } = parseGitURI(new URL(document.uri))

        const vars = { repository: repo, commit, path, line: position.line, character: position.character }
        const response = await queryGraphQL<SymbolInfoResponse>(symbolInfoDefinitionQuery, vars)

        return response?.repository?.commit?.blob?.symbolInfo ?? undefined
    }

    return {
        async definition(document, position) {
            const symbol = await findSymbol(document, position)
            if (!symbol) {
                return null
            }

            if (!symbol.def) {
                const symbolInfo = await fetchSymbolInfo(document, position)
                if (!symbolInfo) {
                    return null
                }

                const location = {
                    repo: symbolInfo.definition.repo,
                    commit: symbolInfo.definition.commit,
                    path: symbolInfo.definition.path,
                    row: symbolInfo.definition.line,
                    column: symbolInfo.definition.character,
                    length: symbolInfo.definition.length,
                }
                return mkSourcegraphLocation({ ...parseGitURI(new URL(document.uri)), ...location })
            }

            return mkSourcegraphLocation({ ...parseGitURI(new URL(document.uri)), ...symbol.def })
        },
        async references(document, position) {
            const symbol = await findSymbol(document, position)
            if (!symbol?.refs) {
                return null
            }

            return symbol.refs.map(reference =>
                mkSourcegraphLocation({ ...parseGitURI(new URL(document.uri)), ...reference })
            )
        },
        async hover(document, position) {
            const symbol = await findSymbol(document, position)
            if (!symbol) {
                return null
            }

            if (!symbol.def) {
                const symbolInfo = await fetchSymbolInfo(document, position)
                if (!symbolInfo) {
                    return null
                }

                if (!symbolInfo.hover) {
                    return null
                }

                return { contents: { value: symbolInfo.hover ?? undefined, kind: sourcegraph.MarkupKind.Markdown } }
            }

            if (!symbol?.hover) {
                return null
            }

            return { contents: { value: symbol.hover, kind: sourcegraph.MarkupKind.Markdown } }
        },
        async documentHighlights(document, position) {
            const symbol = await findSymbol(document, position)
            if (!symbol?.refs) {
                return null
            }

            return symbol.refs.map(reference => ({
                range: rangeToSourcegraphRange(reference),
                kind: sourcegraph.DocumentHighlightKind.Text,
            }))
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        async implementations() {
            return null
        },
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
    def?: Range
    refs?: Range[]
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
    range: rangeToSourcegraphRange({ row, column, length }),
})

const rangeToSourcegraphRange = ({ row, column, length }: Range): sourcegraph.Range =>
    new sourcegraph.Range(row, column, row, column + length)

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

type SymbolInfoResponse = GenericBlobResponse<{
    symbolInfo: SymbolInfo | null
}>

interface SymbolInfo {
    definition: RepoCommitPath & { line: number; character: number; length: number }
    hover: string | null
}

const symbolInfoDefinitionQuery = gql`
    query SymbolInfo($repository: String!, $commit: String!, $path: String!, $line: Int!, $character: Int!) {
        repository(name: $repository) {
            commit(rev: $commit) {
                blob(path: $path) {
                    symbolInfo(line: $line, character: $character) {
                        definition {
                            repo
                            commit
                            path
                            line
                            character
                            length
                        }
                        hover
                    }
                }
            }
        }
    }
`
