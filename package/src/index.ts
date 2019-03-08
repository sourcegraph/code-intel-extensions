import * as sourcegraph from 'sourcegraph'
import { Handler, documentSelector, HandlerArgs } from './handler'

// No-op for Sourcegraph versions prior to 3.0-preview
const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export function activateBasicCodeIntel(
    args: Omit<HandlerArgs, 'sourcegraph'>
): (ctx: sourcegraph.ExtensionContext) => void {
    return function activate(
        ctx: sourcegraph.ExtensionContext = DUMMY_CTX
    ): void {
        const h = new Handler({ ...args, sourcegraph })

        sourcegraph.internal.updateContext({ isImprecise: true })

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
}
