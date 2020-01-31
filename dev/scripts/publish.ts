import * as child_process from 'mz/child_process'
import * as fs from 'mz/fs'
import * as path from 'path'
import { findLanguageSpecs } from './args'

async function main(): Promise<void> {
    const languageIDs = findLanguageSpecs().map(
        ({ handlerArgs: { languageID } }) => languageID
    )

    await Promise.all(
        languageIDs.map(async languageID => {
            if (!(await fs.exists(path.join('temp', languageID)))) {
                throw new Error(`No extension generated for ${languageID}`)
            }
        })
    )

    await Promise.all(languageIDs.map(publish))
}

async function publish(languageID: string): Promise<void> {
    console.log(`Publishing ${languageID} extension`)
    const langDir = path.join('temp', languageID)
    await child_process.exec(`yarn --cwd ${langDir} run publish`)
    console.log('publishing', languageID)
}

main().catch(err => {
    console.error(err && err.message)
    process.exit(1)
})
