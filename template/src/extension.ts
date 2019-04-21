import { Handler, HandlerArgs } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { documentSelector } from '../../package/lib/handler'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    if (languageID === 'all') {
        for (const languageSpec of languageSpecs) {
            activateWithArgs(ctx, { ...languageSpec.handlerArgs, sourcegraph })
        }
    } else {
        // TODO consider Record<LanguageID, LanguageSpec>
        activateWithArgs(ctx, {
            ...languageSpecs.find(l => l.handlerArgs.languageID === languageID)!
                .handlerArgs,
            sourcegraph,
        })
    }
}

function activateWithArgs(
    ctx: sourcegraph.ExtensionContext,
    args: HandlerArgs
): void {
    const h = new Handler({ ...args, sourcegraph })

    sourcegraph.internal.updateContext({ isImprecise: true })
    if (sourcegraph.configuration.get().get('basicCodeIntel.showFeedback')) {
        sourcegraph.internal.updateContext({ showFeedback: true })
    }

    ctx.subscriptions.add(
        sourcegraph.languages.registerHoverProvider(
            documentSelector(h.fileExts),
            {
                provideHover: (doc, pos) => h.hover(doc, pos),
            }
        )
    )
    ctx.subscriptions.add(
        sourcegraph.languages.registerDefinitionProvider(
            documentSelector(h.fileExts),
            {
                provideDefinition: (doc, pos) => h.definition(doc, pos),
            }
        )
    )
    ctx.subscriptions.add(
        sourcegraph.languages.registerReferenceProvider(
            documentSelector(h.fileExts),
            {
                provideReferences: (doc, pos) => h.references(doc, pos),
            }
        )
    )
}
