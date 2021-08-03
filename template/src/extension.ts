import * as sourcegraph from 'sourcegraph'
import { activateCodeIntel } from '../../shared/activate'
import { languageSpecs } from '../../shared/language-specs/languages'
import { languageID } from './language'

/**
 * Register providers on the extension host.
 *
 * @param ctx The extension context.
 */
export const activate = (context: sourcegraph.ExtensionContext): void => {
    for (const spec of languageID === 'all'
        ? languageSpecs
        : languageSpecs.filter(spec => spec.languageID === languageID)) {
        activateCodeIntel(
            context,
            spec.fileExts.flatMap(extension => [{ pattern: `*.${extension}` }]),
            spec
        )
    }
}
