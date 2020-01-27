import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { activateCodeIntel } from '../../package/src'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    for (const languageSpec of languageSpecs.filter(
        l => languageID === 'all' || l.handlerArgs.languageID === languageID
    )) {
        const extensions = languageSpec.handlerArgs.fileExts
        const selector = extensions.map(ext => ({ pattern: `*.${ext}` }))
        const handlerArgs = { sourcegraph, ...languageSpec.handlerArgs }
        activateCodeIntel(ctx, selector, handlerArgs)
    }
}
