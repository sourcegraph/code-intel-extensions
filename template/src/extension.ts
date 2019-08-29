import { Handler, initLSIF, asyncFirst, wrapMaybe } from '../../package/lib'
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
        const lsif = initLSIF()
        const handler = new Handler({
            ...languageSpec.handlerArgs,
            sourcegraph,
        })
        const selector = documentSelector(languageSpec.handlerArgs.fileExts)
        ctx.subscriptions.add(
            sourcegraph.languages.registerHoverProvider(selector, {
                provideHover: asyncFirst(
                    [lsif.hover, wrapMaybe(handler.hover.bind(handler))],
                    null
                ),
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(selector, {
                provideDefinition: asyncFirst(
                    [
                        lsif.definition,
                        wrapMaybe(handler.definition.bind(handler)),
                    ],
                    null
                ),
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerReferenceProvider(selector, {
                provideReferences: asyncFirst(
                    [
                        lsif.references,
                        wrapMaybe(handler.references.bind(handler)),
                    ],
                    []
                ),
            })
        )
    }
}
