import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../../language-specs/languages'
import { activateCodeIntel } from '../../../shared/index'
import { languageID } from './language'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => ({}) } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    for (const languageSpec of languageSpecs.filter(
        l => languageID === 'all' || l.handlerArgs.languageID === languageID
    )) {
        const extensions = languageSpec.handlerArgs.fileExts
        const selector = extensions.map(ext => ({ pattern: `*.${ext}` }))
        const handlerArgs = { sourcegraph, ...languageSpec.handlerArgs }
        activateCodeIntel(ctx, selector, handlerArgs)
    }
}
