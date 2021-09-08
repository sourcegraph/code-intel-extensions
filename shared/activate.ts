import { BehaviorSubject, from, Observable, Subject } from 'rxjs'
import { distinctUntilChanged, map, startWith } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { LanguageSpec } from './language-specs/spec'
import { Logger, RedactingLogger } from './logging'
import { getOrCreateAccessToken } from './lsp/auth'
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
 * Activate the extension. This will provide the LSP factory with a provider wrapper that
 * decorates LSP providers with LSIF-based code intelligence. If no LSP factory is provided,
 * or if it returns false indicating that it cannot register an LSP client, then the default
 * LSIF and search-based providers are registered.
 *
 * @param ctx  The extension context.
 * @param selector The document selector for which this extension is active.
 * @param languageSpec The language spec used to provide search-based code intelligence.
 * @param lspFactory An optional factory that registers an LSP client.
 * @param logger An optional logger instance.
 */
export async function activateCodeIntel(
    context: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    languageSpec: LanguageSpec,
    lspFactory?: LSPFactory,
    logger: Logger = new RedactingLogger(console)
): Promise<void> {
    const wrapper = createProviderWrapper(languageSpec, logger)

    if (!(await tryInitLSP(context, wrapper, lspFactory, logger))) {
        activateWithoutLSP(context, selector, wrapper)
    }
}

/**
 * Run the LSP factory return true if successful. Return false if an error is thrown.
 *
 * @param ctx  The extension context.
 * @param wrapper The provider wrapper.
 * @param lspFactory An optional factory that registers an LSP client.
 * @param logger An optional logger instance.
 */
export async function tryInitLSP(
    context: sourcegraph.ExtensionContext,
    wrapper: ProviderWrapper,
    lspFactory?: LSPFactory,
    logger: Logger = new RedactingLogger(console)
): Promise<boolean> {
    if (!lspFactory) {
        return false
    }

    try {
        if (await lspFactory(context, wrapper)) {
            return true
        }
    } catch (error) {
        logger.error('Failed to initialize language server client', {
            err: error,
        })
    }
    return false
}

/**
 * Create an LSP client and register providers with the given extension context.
 * This function returns true if providers are registered and false otherwise.
 *
 * @param languageID The language identifier
 * @param clientFactory A factory that initializes an LSP client.
 * @param externalReferencesProviderFactory A factory that creates an external reference provider.
 * @param logger An optional logger instance.
 */
export function initLSP<S extends { [key: string]: any }>(
    languageID: string,
    clientFactory: ClientFactory<S>,
    externalReferencesProviderFactory: ExternalReferencesProviderFactory<S>,
    logger: Logger = new RedactingLogger(console)
): (context: sourcegraph.ExtensionContext, providerWrapper: ProviderWrapper) => Promise<boolean> {
    return async (context: sourcegraph.ExtensionContext, providerWrapper: ProviderWrapper): Promise<boolean> => {
        const { settings, settingsSubject } = getSettings<S>(context)

        const serverURL = settings[`${languageID}.serverUrl`]
        if (!serverURL) {
            logger.log('No language server url is configured')
            return false
        }

        const accessToken = await getOrCreateAccessToken(`${languageID}.accessToken`, languageID)
        if (!accessToken) {
            logger.log('No language server access token is available')
        }

        const sgUrl = sourcegraphURL(settings[`${languageID}.sourcegraphUrl`], languageID, logger)

        const { client, featureOptionsSubject } = await clientFactory({
            ctx: context,
            serverURL,
            sourcegraphURL: sgUrl,
            accessToken,
            providerWrapper,
            settings,
        })

        const externalReferencesProvider = externalReferencesProviderFactory({
            client,
            settings,
            sourcegraphServerURL: sgUrl,
            sourcegraphClientURL: sourcegraph.internal.sourcegraphURL,
            accessToken,
        })

        registerExternalReferenceProviderToggle(
            context,
            `${languageID}.impl`,
            settingsSubject,
            `${languageID}.showExternalReferences`,
            featureOptionsSubject,
            externalReferencesProvider
        )
        registerImplementationsPanel(context, `${languageID}.impl`)

        logger.log('Language Server providers are active')
        return true
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
    context: sourcegraph.ExtensionContext,
    selector: sourcegraph.DocumentSelector,
    wrapper: ProviderWrapper
): void {
    context.subscriptions.add(sourcegraph.languages.registerDefinitionProvider(selector, wrapper.definition()))
    context.subscriptions.add(sourcegraph.languages.registerHoverProvider(selector, wrapper.hover()))

    // Do not try to register this provider on pre-3.18 instances as
    // it didn't exist.
    if (sourcegraph.languages.registerDocumentHighlightProvider) {
        context.subscriptions.add(
            sourcegraph.languages.registerDocumentHighlightProvider(selector, wrapper.documentHighlights())
        )
    }

    // Re-register the references provider whenever the value of the
    // mixPreciseAndSearchBasedReferences setting changes.

    let unsubscribeReferencesProvider: sourcegraph.Unsubscribable
    const registerReferencesProvider = (): void => {
        unsubscribeReferencesProvider?.unsubscribe()
        unsubscribeReferencesProvider = sourcegraph.languages.registerReferenceProvider(selector, wrapper.references())
        context.subscriptions.add(unsubscribeReferencesProvider)
    }

    context.subscriptions.add(
        from(sourcegraph.configuration)
            .pipe(
                startWith(false),
                map(() => sourcegraph.configuration.get().get('codeIntel.mixPreciseAndSearchBasedReferences') ?? false),
                distinctUntilChanged(),
                map(registerReferencesProvider)
            )
            .subscribe()
    )
}

/**
 * Return the current settings and an observable that will yield the
 * settings on change.
 *
 * @param ctx The extension context.
 */
function getSettings<S extends { [key: string]: any }>(
    context: sourcegraph.ExtensionContext
): { settings: S; settingsSubject: Observable<S> } {
    const settings = sourcegraph.configuration.get<S>().value
    const settingsSubject: BehaviorSubject<S> = new BehaviorSubject<S>(settings)

    context.subscriptions.add(
        sourcegraph.configuration.subscribe(() => settingsSubject.next(sourcegraph.configuration.get<S>().value))
    )

    return { settings, settingsSubject }
}

/**
 * Return the Sourcegraph URL from the current configuration.
 *
 * @param setting The user configured sourcegraph URL.
 * @param languageID The language identifier.
 * @param logger The logger instance.
 */
function sourcegraphURL(setting: string | undefined, languageID: string, logger: Logger): URL {
    const url = setting || sourcegraph.internal.sourcegraphURL.toString()

    try {
        return new URL(url)
    } catch (error) {
        if (error.message?.includes('Invalid URL')) {
            logger.error(
                new Error(
                    [
                        `Invalid ${languageID}.sourcegraphUrl ${url} in your Sourcegraph settings.`,
                        'Make sure it is set to the address of Sourcegraph from the perspective of the language server (e.g. http://sourcegraph-frontend:30080).',
                        `Read the full documentation for more information: https://github.com/sourcegraph/sourcegraph-${languageID}`,
                    ].join('\n')
                )
            )
        }

        throw error
    }
}

/**
 * When the current settings change, determine if we need to supply/revoke the
 * externalReferencesProvider to the LSP client. This will cause the LSP client
 * features to re-register the references provider via the extension context.
 *
 * @param ctx The extension context.
 * @param implementationId The identifier of the registered locations provider.
 * @param settingsSubject An observable of settings values.
 * @param settingName The setting name to watch for changes.
 * @param featureOptionsSubject The feature options to funnel changes into.
 * @param externalReferencesProvider The external references provider to register.
 */
function registerExternalReferenceProviderToggle<S extends { [key: string]: any }>(
    context: sourcegraph.ExtensionContext,
    implementationId: string,
    settingsSubject: Observable<S>,
    settingName: string,
    featureOptionsSubject: Subject<FeatureOptions>,
    externalReferencesProvider: ReferencesProvider
): void {
    context.subscriptions.add(
        from(settingsSubject)
            .pipe(
                distinctUntilChanged(),
                map(settings => ({
                    implementationId,
                    ...(settings[settingName] ? { externalReferencesProvider } : {}),
                }))
            )
            .subscribe(featureOptionsSubject)
    )
}

/**
 * Register a panel view that will hold the results from the LSP implementations provider.
 *
 * @param ctx The extension context.
 * @param implementationId The identifier of the registered locations provider.
 */
function registerImplementationsPanel(context: sourcegraph.ExtensionContext, implementationId: string): void {
    const panelView = sourcegraph.app.createPanelView(implementationId)
    panelView.title = 'Implementations'
    panelView.component = { locationProvider: implementationId }
    panelView.priority = 160
    context.subscriptions.add(panelView)
}
