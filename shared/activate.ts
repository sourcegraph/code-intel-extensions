import { Subject } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { LanguageSpec } from './language-specs/spec'
import { Logger, RedactingLogger } from './logging'
import { LSPClient } from './lsp/client'
import { FeatureOptions } from './lsp/registration'
import { createProviderWrapper, ProviderWrapper, ReferencesProvider } from './providers'

/**
 * A factory function that attempts to create an LSP client and register
 * providers with the given extension context. This function returns true
 * if providers are registered and false otherwise.
 */
export type LSPFactory = (context: sourcegraph.ExtensionContext, providerWrapper: ProviderWrapper) => Promise<boolean>

/**
 * A factory function that creates an LSP client. This function returns the
 * client and the a features option subject that can be passed feature
 * options at runtime to change the behavior of the registered providers.
 *
 * @param args Parameter bag.
 */
export type ClientFactory<S> = (args: {
    /** The extension context. */
    ctx: sourcegraph.ExtensionContext
    /** The URL of the LSP server. */
    serverURL: string
    /** The URL of the Sourcegraph API. */
    sourcegraphURL: URL
    /** The access token. */
    accessToken?: string
    /**
     * A value that can decorate definition, references, and hover providers
     * with LSIF and basic intelligence.
     */
    providerWrapper: ProviderWrapper
    /** The current settings. */
    settings: S
}) => Promise<{
    client: LSPClient
    featureOptionsSubject: Subject<FeatureOptions>
}>

/**
 * A factory function that creates an LSP-based external references provider.
 *
 * @param args Parameter bag.
 */
export type ExternalReferencesProviderFactory<S> = (args: {
    /** The LSP client. */
    client: LSPClient
    /** The current settings. */
    settings: S
    /** A URL of the Sourcegraph API reachable from the language server. */
    sourcegraphServerURL: URL
    /** A URL of the Sourcegraph API reachable from the browser. */
    sourcegraphClientURL: URL
    /** The access token. */
    accessToken?: string
}) => ReferencesProvider

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
 * @param lspFactory An optional factory that registers an LSP client.
 * @param logger An optional logger instance.
 */
export function activateCodeIntel(
    context: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    languageSpec: LanguageSpec,
    lspFactory?: LSPFactory,
    logger: Logger = new RedactingLogger(console)
): void {
    const wrapper = createProviderWrapper(languageSpec, logger)

    context.subscriptions.add(sourcegraph.languages.registerDefinitionProvider(selector, wrapper.definition()))
    context.subscriptions.add(sourcegraph.languages.registerReferenceProvider(selector, wrapper.references()))
    context.subscriptions.add(sourcegraph.languages.registerHoverProvider(selector, wrapper.hover()))

    // Do not try to register this provider on pre-3.18 instances as it didn't exist.
    if (sourcegraph.languages.registerDocumentHighlightProvider) {
        context.subscriptions.add(
            sourcegraph.languages.registerDocumentHighlightProvider(selector, wrapper.documentHighlights())
        )
    }
}
