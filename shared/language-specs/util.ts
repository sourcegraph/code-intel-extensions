import { isDefined } from '../util/util'
import { Result } from './spec'

/**
 * Extract content from each line of the source file. The first match on
 * each line is returned. Each supplied pattern is expected to have exactly
 * one capture group, which is returned on successful match.
 *
 * @param fileContent The content of the source file.
 * @param patterns The regex patterns executed on each source line.
 */
export function extractFromLines(
    fileContent: string,
    ...patterns: RegExp[]
): string[] {
    const extractMatch = (line: string): string | undefined => {
        for (const pattern of patterns) {
            const match = pattern.exec(line)
            if (match) {
                return match[1]
            }
        }

        return undefined
    }

    return fileContent
        .split('\n')
        .map(extractMatch)
        .filter(isDefined)
}

/**
 * TODO
 *
 * @param results
 * @param fn
 */
export function filterResultsByImports(
    results: Result[],
    importPaths: string[],
    fn: (result: Result, importPath: string) => boolean
): Result[] {
    return filterResults(results, result =>
        importPaths.some(importPath => fn(result, importPath))
    )
}

/**
 * TODO
 *
 * @param results
 * @param fn
 */
export function filterResults(
    results: Result[],
    fn: (result: Result) => boolean
): Result[] {
    const filteredResults = results.filter(result => fn(result))

    // If we filtered out all results, fall back to whatever fuzzy
    // results we had in the first place. It's better than nothing.
    return filteredResults.length === 0 ? results : filteredResults
}

export function removeExtension(filePath: string): string {
    return filePath.replace(/\.[^/.]+$/, '')
}

export function slashToDot(s: string): string {
    return s.replace(/\//g, '.')
}

export function dotToSlash(s: string): string {
    return s.replace(/\./g, '/')
}
