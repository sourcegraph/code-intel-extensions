import { cStyleComment } from './comments'
import { FilterContext, LanguageSpec, Result } from './spec'
import {
    dotToSlash,
    extractFromLines,
    filterResultsByImports,
    removeExtension,
} from './util'

/**
 * Filter a list of candidate definitions to select those likely to be valid
 * cross-references for a definition in this file. Accept candidates located in
 * files that are a suffix match (ignoring file extension) for some import of
 * the current file.
 *
 * For imports we examine user `#include` and `#import` paths, as well as
 * Objective C module `@import` package names. If no candidates match, fall
 * back to the raw (unfiltered) results so that the user doesn't get an empty
 * response unless there really is nothing.
 */
function filterDefinitions<T extends Result>(
    results: T[],
    { fileContent }: FilterContext
): T[] {
    // Capture user paths from #include and #import directives. Do not capture
    // system paths (e.g. <stdio.h>).
    const importPaths = extractFromLines(
        fileContent,
        /^#(?:include|import) "(.*)"$/
    )

    // Capture Objective-C import statements. In plain C and C++ files, this
    // should not capture anything.
    const objCImports = extractFromLines(fileContent, /^@import (.+);$/)

    // Rewrite `@import x.y.z;` as x/y/z to make the paths uniform with the
    // C and C++ paths captured above.
    const objCImportPaths = objCImports.map(dotToSlash)

    return filterResultsByImports(
        results,
        importPaths.concat(objCImportPaths),
        ({ file }, importPath) =>
            // Match results with a basename suffix of an import path
            removeExtension(file).endsWith(removeExtension(importPath))
    )
}

export const cppSpec: LanguageSpec = {
    languageID: 'cpp',
    stylized: 'C++',
    fileExts: [
        'c',
        'cc',
        'cpp',
        'cxx',
        'hh',
        'h',
        'hpp',
        'ino', // Arduino
        'm', // Objective-C
    ],
    commentStyle: cStyleComment,
    filterDefinitions,
}

export const cudaSpec: LanguageSpec = {
    languageID: 'cuda',
    stylized: 'CUDA',
    fileExts: ['cu', 'cuh'],
    commentStyle: cStyleComment,
    filterDefinitions,
}
