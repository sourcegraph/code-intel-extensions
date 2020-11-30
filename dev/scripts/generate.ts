import { copy, emptyDir, ensureDir } from 'fs-extra'
import * as fs from 'mz/fs'
import * as path from 'path'
import { LanguageSpec } from '../../shared/language-specs/spec'
import { findLanguageSpecs } from './args'

async function main(): Promise<void> {
    const specs = findLanguageSpecs()
    await Promise.all(specs.map(spec => generate(spec)))
}

const templateDirectory = path.join('extensions', 'template')

async function generate({ languageID, stylized }: LanguageSpec): Promise<void> {
    console.log(`Generating ${languageID} extension`)

    const langDirectory = path.join('temp', languageID)
    const iconFilename = path.join('icons', `${languageID}.png`)
    const packageFilename = path.join(langDirectory, 'package.json')
    const readmeFilename = path.join(langDirectory, 'README.md')
    const languageFilename = path.join(langDirectory, 'src', 'language.ts')

    await ensureDir(langDirectory)
    await emptyDir(langDirectory)
    await copy(templateDirectory, langDirectory)

    // Update package.json contents
    const packageContents = (await fs.readFile(packageFilename)).toString()
    await fs.writeFile(
        packageFilename,
        JSON.stringify(
            {
                // N.B. This needs to be first so we can overwrite default
                // fields for this extension (notably "name").
                ...JSON.parse(packageContents),

                name: languageID,
                title: `${stylized} code intelligence`,
                description: `Provides search-based code intelligence for ${stylized} using the Sourcegraph search API`,
                activationEvents: [`onLanguage:${languageID}`],
                icon: `data:image/png;base64,${(await fs.readFile(iconFilename)).toString('base64')}`,
            },
            null,
            2
        )
    )

    // Update README.md placeholders with language name
    await fs.writeFile(
        readmeFilename,
        (await fs.readFile(readmeFilename))
            .toString()
            .replace(/LANG\b/g, stylized)
            .replace(/LANGID\b/g, languageID)
    )

    await fs.writeFile(
        languageFilename,
        // Update code to only provide intel for one language
        `export const languageID: string | undefined = '${languageID}'\n`
    )
}

main().catch(error => {
    console.error(error?.message)
    process.exit(1)
})
