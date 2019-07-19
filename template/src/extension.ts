import { activateBasicCodeIntel } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    if (languageID === 'all') {
        for (const languageSpec of languageSpecs) {
            activateBasicCodeIntel({
                ...languageSpec.handlerArgs,
                sourcegraph,
            })(ctx)
        }
    } else {
        // TODO consider Record<LanguageID, LanguageSpec>
        activateBasicCodeIntel({
            ...languageSpecs.find(l => l.handlerArgs.languageID === languageID)!
                .handlerArgs,
            sourcegraph,
        })(ctx)
    }
}
