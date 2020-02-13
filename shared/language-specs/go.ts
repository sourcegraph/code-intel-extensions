import * as path from 'path'
import { FilterArgs, LanguageSpec, Result } from './spec'
import { extractFromLines, filterResults } from './util'

function filterDefinitions({
    repo,
    filePath,
    fileContent,
    results,
}: FilterArgs): Result[] {
    const importPaths = extractFromLines(
        fileContent,
        /^(?:import |\t)(?:\w+ |\. )?"(.*)"$/
    )

    return filterResults(results, ({ repo: resultRepo, file }) => {
        const resultImportPath = importPath(resultRepo, file)

        return (
            // Match results from the same package
            resultImportPath === importPath(repo, filePath) ||
            // Match results that are imported explicitly
            importPaths.some(i => resultImportPath.includes(i))
        )
    })
}

/**
 * Return the Go import path for a particular file.
 *
 * @param repo The name of the repository.
 * @param filePath The relative path to the file from the repo root.
 */
function importPath(repo: string, filePath: string): string {
    return `${repo}/${path.dirname(filePath)}`
}

export const goSpec: LanguageSpec = {
    languageID: 'go',
    stylized: 'Go',
    fileExts: ['go'],
    commentStyle: { lineRegex: /\/\/\s?/ },
    filterDefinitions,
}
