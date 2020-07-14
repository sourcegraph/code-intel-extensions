import * as sourcegraph from 'sourcegraph'
import { LineMatch, SearchResult, SearchSymbol } from '../util/api'
import { isDefined } from '../util/helpers'

/**
 * The exploded version of a search result. Each symbol and indexed/un-indexed
 * search result becomes a single instance of this interface.
 */
export interface Result {
    /** The name of the repository containing the result. */
    repo: string

    /** The commit containing the result. */
    rev: string

    /** The path to the result file relative to the repository root. */
    file: string

    /** The range of the match. */
    range: sourcegraph.Range

    /** The type of symbol, if the result came from a symbol search. */
    symbolKind?: string

    /**
     * Whether or not the symbol is local to the containing file, if
     * the result came from a symbol search.
     */
    fileLocal?: boolean
}

/**
 * Convert a search result into a set of results.
 *
 * @param searchResult The search result.
 */
export function searchResultToResults({ ...result }: SearchResult): Result[] {
    const symbolResults = result.symbols ? result.symbols.map(s => searchResultSymbolToResults(result, s)) : []

    const lineMatchResults = result.lineMatches ? result.lineMatches.flatMap(m => lineMatchesToResults(result, m)) : []

    return symbolResults.filter(isDefined).concat(lineMatchResults)
}

/**
 * Convert a search symbol to a result.
 *
 * @param arg0 The parent search result.
 * @param arg1 The search symbol.
 */
function searchResultSymbolToResults(
    {
        repository: { name: repo },
        file: {
            commit: { oid: rev },
        },
    }: SearchResult,
    {
        kind: symbolKind,
        fileLocal,
        location: {
            resource: { path: file },
            range,
        },
    }: SearchSymbol
): Result | undefined {
    return (
        range && {
            repo,
            rev,
            file,
            range,
            symbolKind,
            fileLocal,
        }
    )
}

/**
 * Convert a line match to a result.
 *
 * @param arg0 The parent search result.
 * @param arg1 The line match.
 */
function lineMatchesToResults(
    {
        repository: { name: repo },
        file: {
            path: file,
            commit: { oid: rev },
        },
    }: SearchResult,
    { lineNumber, offsetAndLengths }: LineMatch
): Result[] {
    return offsetAndLengths.map(([offset, length]) => ({
        repo,
        rev,
        file,
        range: new sourcegraph.Range(lineNumber, offset, lineNumber, offset + length),
    }))
}

/**
 * Convert an internal result into a Sourcegraph location.
 *
 * @param result The search result.
 */
export function resultToLocation({ repo, rev, file, range }: Result): sourcegraph.Location {
    return { uri: new URL(`git://${repo}?${rev || 'HEAD'}#${file}`), range }
}
