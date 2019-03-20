import { activateBasicCodeIntel } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'

export function activate(ctx: sourcegraph.ExtensionContext): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    if (languageID === 'all') {
        for (const languageSpec of languageSpecs) {
            activateBasicCodeIntel(languageSpec.handlerArgs)(ctx)
        }
    } else {
        // TODO consider Record<LanguageID, LanguageSpec>
        activateBasicCodeIntel(
            languageSpecs.find(l => l.handlerArgs.languageID === languageID)!
                .handlerArgs
        )(ctx)
    }
}
