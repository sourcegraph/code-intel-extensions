import yargs from 'yargs'
import { languageSpecs } from '../../shared/language-specs/languages'
import { LanguageSpec } from '../../shared/language-specs/spec'

const blacklist = ['go', 'typescript']

export function findLanguageSpecs(): LanguageSpec[] {
    const args = yargs
        .nargs('languages', 1)
        .describe('l', 'A list of (comma-separated) languages to generate')
        .alias('l', 'languages')
        .strict().argv as { languages?: string }

    const candidates = languageSpecs.filter(s => !blacklist.includes(s.languageID))

    if (!args.languages) {
        return candidates
    }

    // Verify that each flagged language matches a candidate, and filter the
    // candidates to only those selected.
    const ids = args.languages.split(',')
    for (const id of ids) {
        if (!candidates.find(spec => spec.languageID === id)) {
            throw new Error(`Unknown language ${id}.`)
        }
    }
    return candidates.filter(spec => ids.includes(spec.languageID))
}
