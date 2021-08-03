import * as sourcegraph from 'sourcegraph'
import { activateCodeIntel } from '../../../shared/activate'
import { findLanguageSpec } from '../../../shared/language-specs/languages'

const documentSelector: sourcegraph.DocumentSelector = [{ language: 'typescript' }, { language: 'javascript' }]

/**
 * Register providers on the extension host.
 *
 * @param ctx The extension context.
 */
export function activate(context: sourcegraph.ExtensionContext): void {
    return activateCodeIntel(
        context,
        documentSelector,
        findLanguageSpec('typescript'),
    )
}
