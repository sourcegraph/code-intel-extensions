import { Handler } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { documentSelector } from '../../package/lib/handler'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    for (const languageSpec of languageID === 'all'
        ? languageSpecs
        : [languageSpecs.find(l => l.handlerArgs.languageID === languageID)!]) {
        const handler = new Handler({
            ...languageSpec.handlerArgs,
            sourcegraph,
        })
        const selector = documentSelector(languageSpec.handlerArgs.fileExts)
        ctx.subscriptions.add(
            sourcegraph.languages.registerHoverProvider(selector, {
                provideHover: handler.hover.bind(handler),
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(selector, {
                provideDefinition: handler.definition.bind(handler),
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerReferenceProvider(selector, {
                provideReferences: handler.references.bind(handler),
            })
        )
    }
}
