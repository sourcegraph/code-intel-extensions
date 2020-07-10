import * as fs from 'mz/fs'
import fetch from 'node-fetch'

const SCHEMA_URL =
    'https://raw.githubusercontent.com/sourcegraph/sourcegraph/master/cmd/frontend/graphqlbackend/schema.graphql'

async function main(): Promise<void> {
    await fs.writeFile(
        './schema/schema.graphql',
        await (await fetch(SCHEMA_URL)).text()
    )
}

main().catch(err => {
    console.error(err?.message)
    process.exit(1)
})
