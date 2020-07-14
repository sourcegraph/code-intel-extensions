import * as sourcegraph from 'sourcegraph'
import { activateCodeIntel } from '../../../shared/activate'
import { languageSpecs } from '../../../shared/language-specs/languages'
import { LanguageSpec } from '../../../shared/language-specs/spec'
import { languageID } from './language'

/**
 * The set of languages that are actively served by this extension. This
 * will be exactly one language once published, but will be all languages
 * when being run in development mode.
 *
 * The constant in `language.ts` is updated by the generation/publish flow.
 */
const activeLanguageSpecs =
    languageID === 'all' ? languageSpecs : languageSpecs.filter(spec => spec.languageID === languageID)

/**
 * Register providers on the extension host.
 *
 * @param ctx The extension context.
 */
export async function activate(ctx?: sourcegraph.ExtensionContext): Promise<void> {
    await Promise.all(activeLanguageSpecs.map(spec => activateSpec(spec, ctx)))
}

/**
 * Register providers on the extension host for the given language spec.
 *
 * @param spec The language spec.
 * @param ctx The extension context.
 */
function activateSpec(spec: LanguageSpec, ctx?: sourcegraph.ExtensionContext): Promise<void> {
    return activateCodeIntel(ctx, spec.fileExts.flatMap(createSelector), spec)
}

function createSelector(ext: string): sourcegraph.DocumentSelector {
    return [{ pattern: `*.${ext}` }]
}
