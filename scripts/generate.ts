import * as path from 'path'

import { copy, emptyDir, ensureDir } from 'fs-extra'
import * as fs from 'mz/fs'
import readdir from 'recursive-readdir'

import { LanguageSpec } from '../template/src/language-specs/spec'

import { findLanguageSpecs } from './args'

async function main(): Promise<void> {
    const specs = findLanguageSpecs()
    await Promise.all(specs.map(spec => generate(spec)))
}

async function generate({ languageID, stylized, additionalLanguages = [] }: LanguageSpec): Promise<void> {
    console.log(`Generating ${languageID} extension`)

    const langDirectory = `generated-${languageID}`
    const iconFilename = path.join('icons', `${languageID}.png`)
    const packageFilename = path.join(langDirectory, 'package.json')
    const readmeFilename = path.join(langDirectory, 'README.md')

    await ensureDir(langDirectory)
    await emptyDir(langDirectory)
    await copy('template', langDirectory)

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
                activationEvents: [
                    `onLanguage:${languageID}`,
                    ...additionalLanguages?.map(language => `onLanguage:${language}`),
                ],
                icon: `data:image/png;base64,${(await fs.readFile(iconFilename)).toString('base64')}`,
            },
            null,
            2
        )
    )

    // Update LANG/LANGID placeholders with language name
    const templateFiles = [packageFilename, readmeFilename, ...(await readdir(path.join(langDirectory, 'src')))]
    for (const filename of templateFiles) {
        const old = await fs.readFile(filename, 'utf8')
        const new_ = old.replace(/LANG\b/g, stylized).replace(/LANGID\b/g, languageID)
        await fs.writeFile(filename, new_)
    }
}

main().catch(error => {
    console.error(error?.message)
    process.exit(1)
})
