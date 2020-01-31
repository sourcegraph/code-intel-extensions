import { HandlerArgs } from '../../../shared/index'
import * as path from 'path'
import * as sourcegraph from 'sourcegraph'

export const handlerArgs: HandlerArgs = {
    sourcegraph,
    languageID: 'typescript',
    fileExts: ['ts', 'tsx', 'js', 'jsx'],
    commentStyle: {
        lineRegex: /\/\/\s?/,
        block: {
            startRegex: /\/\*\*?/,
            lineNoiseRegex: /(^\s*\*\s?)?/,
            endRegex: /\*\//,
        },
    },
    filterDefinitions: ({ filePath, fileContent, results }) => {
        const imports = fileContent
            .split('\n')
            .map(line => {
                // Matches the import at index 1
                const match =
                    /\bfrom ['"](.*)['"];?$/.exec(line) ||
                    /\brequire\(['"](.*)['"]\)/.exec(line)
                return match ? match[1] : undefined
            })
            .filter((x): x is string => Boolean(x))

        const filteredResults = results.filter(result =>
            imports.some(
                i =>
                    path.join(path.dirname(filePath), i) ===
                    result.file.replace(/\.[^/.]+$/, '')
            )
        )

        return filteredResults.length === 0 ? results : filteredResults
    },
}
