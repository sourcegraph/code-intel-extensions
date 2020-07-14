import * as child_process from 'mz/child_process'
import * as fs from 'mz/fs'
import * as path from 'path'
import { findLanguageSpecs } from './args'

async function main(): Promise<void> {
    const languageIDs = findLanguageSpecs().map(({ languageID }) => languageID)

    await Promise.all(
        languageIDs.map(async languageID => {
            if (!(await fs.exists(path.join('temp', languageID)))) {
                throw new Error(`No extension generated for ${languageID}`)
            }
        })
    )

    for (const languageID of languageIDs) {
        await publish(languageID)
    }
}

async function publish(languageID: string): Promise<void> {
    console.log(`Publishing ${languageID} extension`)
    const langDirectory = path.join('temp', languageID)
    await child_process.exec(`yarn --cwd ${langDirectory} run publish`)
}

main().catch(error => {
    console.error(error?.message)
    process.exit(1)
})
