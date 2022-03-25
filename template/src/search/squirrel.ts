/* eslint-disable @typescript-eslint/consistent-type-assertions */

import * as sourcegraph from 'sourcegraph'

import { PromiseProviders } from '../providers'
import { API, Range, RepoCommitPath } from '../util/api'
import { parseGitURI } from '../util/uri'

export const mkSquirrel = (api: API): PromiseProviders => ({
    async definition(document, position) {
        const symbol = await api.findSymbol(document, position)
        if (!symbol) {
            return null
        }

        if (!symbol.def) {
            return null
        }

        return mkSourcegraphLocation({ ...parseGitURI(new URL(document.uri)), ...symbol.def })
    },
    async references(document, position) {
        const symbol = await api.findSymbol(document, position)
        if (!symbol?.refs) {
            return null
        }

        return symbol.refs.map(reference =>
            mkSourcegraphLocation({ ...parseGitURI(new URL(document.uri)), ...reference })
        )
    },
    async hover(document, position) {
        const symbol = await api.findSymbol(document, position)
        if (!symbol) {
            return null
        }

        if (!symbol?.hover) {
            return null
        }

        return { contents: { value: symbol.hover, kind: sourcegraph.MarkupKind.Markdown } }
    },
    async documentHighlights(document, position) {
        const symbol = await api.findSymbol(document, position)
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
