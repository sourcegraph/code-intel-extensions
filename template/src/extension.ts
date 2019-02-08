import { activateBasicCodeIntel } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import * as spec from '../../languages'

export function activate(ctx: sourcegraph.ExtensionContext): void {
    for (const language of Object.keys(spec.languages)) {
        activateBasicCodeIntel(spec.languages[language].handlerArgs)(ctx)
    }
}
