import yargs from 'yargs'

import { languageSpecs } from '../template/src/language-specs/languages'
import { LanguageSpec } from '../template/src/language-specs/spec'

export function findLanguageSpecs(): LanguageSpec[] {
    const args = yargs
        .nargs('languages', 1)
        .describe('l', 'A list of (comma-separated) languages to generate')
        .alias('l', 'languages')
        .strict().argv as { languages?: string }

    if (!args.languages) {
        return languageSpecs
    }

    // Verify that each flagged language matches a candidate, and filter the
    // languageSpecs to only those selected.
    const ids = args.languages.split(',')
    for (const id of ids) {
        if (!languageSpecs.find(spec => spec.languageID === id)) {
            throw new Error(`Unknown language ${id}.`)
        }
    }
    return languageSpecs.filter(spec => ids.includes(spec.languageID))
}
