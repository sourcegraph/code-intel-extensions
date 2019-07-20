import { Handler, initLSIF } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    for (const languageSpec of languageID === 'all'
        ? languageSpecs
        : [languageSpecs.find(l => l.handlerArgs.languageID === languageID)!]) {
        if (sourcegraph.configuration.get().get('codeIntel.lsif')) {
            initLSIF()
        } else {
            activateBasicCodeIntel({
                ...languageSpec.handlerArgs,
                sourcegraph,
            })(ctx)
        }
    }
}
