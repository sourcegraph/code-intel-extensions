import * as sourcegraph from 'sourcegraph'
import { LanguageSpec } from './language-specs/languages'
import { createProviderWrapper, ProviderWrapper } from './providers'

/**
 * A factory function that attempts to create an LSP client and register
 * providers with the given extension context. This function returns true
 * if providers are registered and false otherwise.
 */
export type LSPFactory = (
    ctx: sourcegraph.ExtensionContext,
    providerWrapper: ProviderWrapper
) => Promise<boolean>

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
 * Activate the extension. This will provide the LSP factory with a provider wrapper that
 * decorates LSP providers with LSIF-based code intelligence. If no LSP factory is provided,
 * or if it returns false indicating that it cannot register an LSP client, then the default
 * LSIF and search-based providers are registered.
 *
 * @param ctx  The extension context.
 * @param selector The document selector for which this extension is active.
 * @param languageSpec The language spec used to provide search-based code intelligence.
 * @param lspFactory An optional factory that registers an LSP client.
 */
export async function activateCodeIntel(
    ctx: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    languageSpec: LanguageSpec,
    lspFactory?: LSPFactory
): Promise<void> {
    const wrapper = createProviderWrapper(languageSpec)
    const activated = lspFactory && (await lspFactory(ctx, wrapper))
    if (!activated) {
        activateWithoutLSP(ctx, selector, wrapper)
    }
}

/**
 * Register definition, reference, and hover providers with LSIF and search-based providers.
 *
 * @param ctx The extension context.
 * @param selector The document selector for which this extension is active.
 * @param wrapper The provider wrapper.
 */
function activateWithoutLSP(
    ctx: sourcegraph.ExtensionContext,
    selector: sourcegraph.DocumentSelector,
    wrapper: ProviderWrapper
): void {
    ctx.subscriptions.add(
        sourcegraph.languages.registerDefinitionProvider(
            selector,
            wrapper.definition()
        )
    )

    ctx.subscriptions.add(
        sourcegraph.languages.registerReferenceProvider(
            selector,
            wrapper.references()
        )
    )

    ctx.subscriptions.add(
        sourcegraph.languages.registerHoverProvider(selector, wrapper.hover())
    )
}
