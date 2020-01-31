import { copy, emptyDir, ensureDir } from 'fs-extra'
import * as fs from 'mz/fs'
import * as path from 'path'
import { LanguageSpec } from '../../shared/language-specs/languages'
import { findLanguageSpecs } from './args'

async function main(): Promise<void> {
    const specs = findLanguageSpecs()
    await Promise.all(specs.map(s => generate(s)))
}

const templateDir = path.join('extensions', 'template')

async function generate({
    stylized,
    handlerArgs: { languageID },
}: LanguageSpec): Promise<void> {
    console.log(`Generating ${languageID} extension`)

    const langDir = path.join('temp', languageID)
    const iconFilename = path.join('icons', `${languageID}.png`)
    const pkgFilename = path.join(langDir, 'package.json')
    const readmeFilename = path.join(langDir, 'README.md')
    const languageFilename = path.join(langDir, 'src', 'language.ts')

    await ensureDir(langDir)
    await emptyDir(langDir)
    await copy(templateDir, langDir)

    // Update package.json contents
    const packageContents = (await fs.readFile(pkgFilename)).toString()
    await fs.writeFile(
        pkgFilename,
        JSON.stringify(
            {
                name: languageID,
                title: `${stylized} code intelligence`,
                description: `Provides basic code intelligence for ${stylized} using the Sourcegraph search API`,
                activationEvents: [`onLanguage:${languageID}`],
                icon: `data:image/png;base64,${(
                    await fs.readFile(iconFilename)
                ).toString('base64')}`,
                ...JSON.parse(packageContents),
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
            .replace(/LANGNAME\b/g, languageID)
    )

    await fs.writeFile(
        languageFilename,
        // Update code to only provide intel for one language
        `export const languageID: string | undefined = '${languageID}'\n`
    )
}

main().catch(err => {
    console.error(err && err.message)
    process.exit(1)
})
