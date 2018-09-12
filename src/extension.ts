import * as sourcegraph from 'sourcegraph'
import { Handler, Config } from './handler'

export async function activate(): Promise<void> {
    const h = new Handler()

    sourcegraph.commands.registerCommand('basicCodeIntel.toggle', () => {
        // Toggle between 2 states:
        //
        // Enabled: basicCodeIntel.enabled = true and extensions.langserver/* = false
        //
        // Disabled: basicCodeIntel.enabled = false and extensions.langserver/* = true
        //
        // These 2 states are not inverses of each other. Enabling and disabling basic code
        // intel might enable or disable langserver extensions in a way that the user does not
        // expect or desire.
        const config = sourcegraph.configuration.get<
            Config & { extensions: { [id: string]: boolean } }
        >()

        const newEnabled = !config.get('basicCodeIntel.enabled')
        config
            .update('basicCodeIntel.enabled', newEnabled)
            .then(async () => {
                const extensions = { ...(config.get('extensions') || {}) }
                for (const extensionID of Object.keys(extensions)) {
                    if (
                        extensionID.startsWith('langserver/') ||
                        extensionID.includes('/langserver')
                    ) {
                        extensions[extensionID] = !newEnabled
                    }
                }
                await config.update('extensions', extensions)
            })
            .catch(err => console.error(err))
    })

    sourcegraph.languages.registerDefinitionProvider(['*'], {
        provideDefinition: (doc, pos) => h.definition(doc, pos),
    })
    sourcegraph.languages.registerReferenceProvider(['*'], {
        provideReferences: (doc, pos) => h.references(doc, pos),
    })
}
