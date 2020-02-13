import * as path from 'path'
import { cStyle } from './common'
import { FilterArgs, LanguageSpec, Result } from './spec'
import {
    extractFromLines,
    filterResultsByImports,
    removeExtension,
} from './util'

function filterDefinitions({
    filePath,
    fileContent,
    results,
}: FilterArgs): Result[] {
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
