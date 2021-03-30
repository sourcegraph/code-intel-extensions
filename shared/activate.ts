import * as sourcegraph from 'sourcegraph'
import { LanguageSpec } from './language-specs/spec'
import { Logger, RedactingLogger } from './logging'
import { createProviders } from './providers'

/**
 * A dummy context that is used for versions of Sourcegraph to 3.0.
 */
const DUMMY_CTX = {
    subscriptions: {
        add: (): void => {
            /* no-op */
        },
    },
}

/**
 * Activate the extension. Register definition, reference, and hover providers with
 * LSIF and search-based providers.
 *
 * @param ctx  The extension context.
 * @param selector The document selector for which this extension is active.
 * @param languageSpec The language spec used to provide search-based code intelligence.
 * @param logger An optional logger instance.
 */
export function activateCodeIntel(
    context: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    languageSpec: LanguageSpec,
    logger: Logger = new RedactingLogger(console)
): void {
    const providers = createProviders(languageSpec, logger)

    context.subscriptions.add(sourcegraph.languages.registerDefinitionProvider(selector, providers.definition))
    context.subscriptions.add(sourcegraph.languages.registerReferenceProvider(selector, providers.references))
    context.subscriptions.add(sourcegraph.languages.registerHoverProvider(selector, providers.hover))

    // Do not try to register this provider on pre-3.18 instances as it didn't exist.
    if (sourcegraph.languages.registerDocumentHighlightProvider) {
        context.subscriptions.add(
            sourcegraph.languages.registerDocumentHighlightProvider(selector, providers.documentHighlights)
        )
    }
}
