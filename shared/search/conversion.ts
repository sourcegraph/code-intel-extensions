import * as sourcegraph from 'sourcegraph'
import { Result } from '../language-specs/languages'
import { LineMatch, SearchResult, SearchSymbol } from '../util/api'
import { isDefined } from '../util/util'

/**
 * Convert an internal result into a Sourcegraph location.
 *
 * @param result The search result.
 */
export function resultToLocation(result: Result): sourcegraph.Location {
    return {
        uri: new URL(
            `git://${result.repo}?${result.rev || 'HEAD'}#${result.file}`
        ),
        range: new sourcegraph.Range(
            result.start.line,
            result.start.character,
            result.end.line,
            result.end.character
        ),
    }
}

/**
 * Convert a search result into a set of results.
 *
 * @param searchResult The search result.
 */
export function searchResultToResults({ ...result }: SearchResult): Result[] {
    const symbolResults = result.symbols
        ? result.symbols.map(s => searchResultSymbolToResults(result, s))
        : []

    const lineMatchResults = result.lineMatches
        ? result.lineMatches.flatMap(m => lineMatchesToResults(result, m))
        : []

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
        name: symbolName,
        kind: symbolKind,
        containerName,
        fileLocal,
        location: {
            resource: { path: file },
            range,
        },
    }: SearchSymbol
): Result | undefined {
    if (!range) {
        return undefined
    }
    const {
        start: { line: startLine, character: startCharacter },
        end: { line: endLine, character: endCharacter },
    } = range

    return {
        repo,
        rev,
        file,
        start: { line: startLine, character: startCharacter },
        end: { line: endLine, character: endCharacter },
        symbolName,
        symbolKind,
        containerName,
        fileLocal,
    }
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
    { lineNumber, preview, offsetAndLengths }: LineMatch
): Result[] {
    return offsetAndLengths.map(offsetAndLength => ({
        repo,
        rev,
        file,
        preview,
        ...offsetAndLengthToRange(lineNumber, offsetAndLength),
    }))
}

/**
 * Convert an offset/length pair into start and end positions.
 *
 * @param line The line number.
 * @param offsetAndLength An offset, length pair.
 */
function offsetAndLengthToRange(
    line: number,
    [offset, length]: [number, number]
): {
    start: { line: number; character: number }
    end: { line: number; character: number }
} {
    return {
        start: { line, character: offset },
        end: { line, character: offset + length },
    }
}
