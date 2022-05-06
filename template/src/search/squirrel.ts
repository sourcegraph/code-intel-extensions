/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { sortBy } from 'lodash'
import * as sourcegraph from 'sourcegraph'

import { PromiseProviders } from '../providers'
import { API, Range, RepoCommitPath } from '../util/api'
import { parseGitURI } from '../util/uri'

export const mkSquirrel = (api: API): PromiseProviders => ({
    async definition(document, position) {
        const local = await api.findLocalSymbol(document, position)

        if (local?.def) {
            return mkSourcegraphLocation({ ...parseGitURI(new URL(document.uri)), ...local.def })
        }

        const symbolInfo = await api.fetchSymbolInfo(document, position)
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
    },
    async references(document, position) {
        const symbol = await api.findLocalSymbol(document, position)
        if (!symbol?.refs) {
            return null
        }

        symbol.refs = sortBy(symbol.refs, reference => reference.row)

        return symbol.refs.map(reference =>
            mkSourcegraphLocation({ ...parseGitURI(new URL(document.uri)), ...reference })
        )
    },
    async hover(document, position) {
        const symbol = await api.findLocalSymbol(document, position)
        if (!symbol) {
            return null
        }

        if (!symbol.def) {
            const symbolInfo = await api.fetchSymbolInfo(document, position)
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
        const symbol = await api.findLocalSymbol(document, position)
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
})

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

// We can't use `new sourcegraph.Range()` directly because it only sets internal fields like `_start` and
// `_end` and in the extension host the type checker believes the properties `start` and `end` exist, but
// they don't.
const rangeToSourcegraphRange = ({ row, column, length }: Range): sourcegraph.Range =>
    ({
        start: { line: row, character: column } as sourcegraph.Position,
        end: { line: row, character: column + length } as sourcegraph.Position,
    } as sourcegraph.Range)
