import * as path from 'path'
import { cStyle } from './common'
import { FilterArgs, LanguageSpec, Result } from './spec'
import { extractFromLines, filterResultsByImports, slashToDot } from './util'

function filterDefinitions({ fileContent, results }: FilterArgs): Result[] {
    const importPaths = extractFromLines(
        fileContent,
        // TODO - support wildcard static imports
        // TODO - ident doesn't need to be upper case
        /^import static ([a-z_0-9.]+)\.[A-Z][\w.]+;$/,
        /^import ([\w.]+);$/
    )

    const currentPackage = extractFromLines(fileContent, /^package ([\w.]+);$/)

    return filterResultsByImports(
        results,
        importPaths.concat(currentPackage),
        ({ file }, importPath) =>
            // Match results with a dirname suffix of an import path
            slashToDot(path.dirname(file)).endsWith(importPath)
    )
}

export const javaSpec: LanguageSpec = {
    languageID: 'java',
    stylized: 'Java',
    fileExts: ['java'],
    docstringIgnore: /^\s*@/,
    commentStyle: cStyle,
    filterDefinitions,
}
