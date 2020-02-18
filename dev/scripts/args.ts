import * as yargs from 'yargs'
import { languageSpecs } from '../../shared/language-specs/languages'
import { LanguageSpec } from '../../shared/language-specs/spec'

const blacklist = ['go', 'typescript']

export function findLanguageSpecs(): LanguageSpec[] {
    const args = yargs
        .nargs('languages', 1)
        .describe('l', 'A list of (comma-separated) languages to generate')
        .alias('l', 'languages')
        .strict().argv as { languages?: string }

    const candidates = languageSpecs.filter(
        s => !blacklist.includes(s.languageID)
    )

    if (!args.languages) {
        return candidates
    }

    return args.languages.split(',').map(languageID => {
        const spec = candidates.find(spec => spec.languageID === languageID)
        if (!spec) {
            throw new Error(`Unknown language ${languageID}.`)
        }

        return spec
    })
}
