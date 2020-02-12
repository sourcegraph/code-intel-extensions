import * as yargs from 'yargs'
import {
    LanguageSpec,
    languageSpecs,
} from '../../shared/language-specs/languages'

const blacklist = ['go', 'typescript']

export function findLanguageSpecs(): LanguageSpec[] {
    const args = yargs
        .nargs('languages', 1)
        .describe('l', 'A list of (comma-separated) languages to generate')
        .alias('l', 'languages')
        .strict().argv as { language?: string }

    const candidates = languageSpecs.filter(
        s => !blacklist.includes(s.languageID)
    )

    if (!args.language) {
        return candidates
    }

    return args.language.split(',').map(languageID => {
        const spec = candidates.find(spec => spec.languageID === languageID)
        if (!spec) {
            throw new Error(`Unknown language ${languageID}.`)
        }

        return spec
    })
}
