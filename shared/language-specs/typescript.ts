import * as path from 'path'
import { cStyle } from './common'
import { FilterContext, LanguageSpec, Result } from './spec'
import {
    extractFromLines,
    filterResultsByImports,
    removeExtension,
} from './util'

/**
 * Filter a list of candidate definitions to select those likely to be valid
 * cross-references for a definition in this file. Accept candidates whose
 * path matches a relative import.
 *
 * If no candidates match, fall back to the raw (unfiltered) results so that
 * the user doesn't get an empty response unless there really is nothing.
 */
function filterDefinitions<T extends Result>(
    results: T[],
    { filePath, fileContent }: FilterContext
): T[] {
    const importPaths = extractFromLines(
        fileContent,
        /\bfrom ['"](.*)['"];?$/,
        /\brequire\(['"](.*)['"]\)/
    )

    return filterResultsByImports(
        results,
        importPaths,
        ({ file }, importPath) =>
            // Match results with a basename suffix of an import path
            path.join(path.dirname(filePath), importPath) ===
            removeExtension(file)
    )
}

export const typescriptSpec: LanguageSpec = {
    languageID: 'typescript',
    stylized: 'TypeScript',
    fileExts: ['ts', 'tsx', 'js', 'jsx'],
    commentStyle: cStyle,
    filterDefinitions,
}
