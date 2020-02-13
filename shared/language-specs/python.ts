import * as path from 'path'
import { pythonStyle } from './common'
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
        /^import ([.\w]*)/,
        /^from ([.\w]*)/
    )

    return filterResultsByImports(
        results,
        importPaths,
        ({ file }, importPath) => {
            const relativePath = relativeImportPath(filePath, importPath)
            if (relativePath) {
                // Match results imported relatively
                return relativePath === removeExtension(file)
            }

            // Match results imported absolutely
            return file.includes(absoluteImportPath(importPath))
        }
    )
}

/**
 * Converts an absolute Python import path into a file path.
 *
 * @param importPath The absolute Python import path.
 */
function absoluteImportPath(importPath: string): string {
    return importPath.replace(/\./g, '/')
}

/**
 * Converts a Python import path into a file path relative to the
 * given source path. If the import path is not relative, method
 * function returns undefined.
 *
 * @param sourcePath The source file.
 * @param importPath The relative or absolute Python import path.
 */
export function relativeImportPath(
    sourcePath: string,
    importPath: string
): string | undefined {
    const match = /^(?:\.)(\.*)(.*)/.exec(importPath)
    if (!match) {
        return undefined
    }
    const [, parentDots, rest] = match

    return path.join(
        path.dirname(sourcePath),
        '../'.repeat(parentDots.length),
        rest.replace(/\./g, '/')
    )
}

export const pythonSpec: LanguageSpec = {
    languageID: 'python',
    stylized: 'Python',
    fileExts: ['py'],
    commentStyle: pythonStyle,
    filterDefinitions,
}
