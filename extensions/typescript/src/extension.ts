import { CancellationTokenSource } from '@sourcegraph/vscode-ws-jsonrpc'
import { Subject } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { activateCodeIntel } from '../../../shared/activate'
import { findLanguageSpec } from '../../../shared/language-specs/languages'
import { NoopLogger } from '../../../shared/logging'
import { getOrCreateAccessToken } from '../../../shared/lsp/auth'
import { LSPClient } from '../../../shared/lsp/client'
import { webSocketTransport } from '../../../shared/lsp/connection'
import { FeatureOptions, register } from '../../../shared/lsp/registration'
import { ProviderWrapper } from '../../../shared/providers'
import { gitToRawApiUri, rawApiToGitUri } from '../../../shared/util/uri'
import { Settings } from './settings'
import { createExternalReferencesProvider } from './xrefs'

const IMPL_ID = 'ts.impl'
const documentSelector: sourcegraph.DocumentSelector = [
    { language: 'typescript' },
    { language: 'javascript' },
]

/**
 * Register providers on the extension host.
 *
 * @param ctx The extension context.
 */
export function activate(ctx?: sourcegraph.ExtensionContext): Promise<void> {
    return activateCodeIntel(
        ctx,
        documentSelector,
        findLanguageSpec('typescript'),
        initLSP
    )
}

/**
 * Attempts to register code intelligence providers powered by a language server.
 * Returns true if an LSP client is registered and false otherwise.
 *
 * @param ctx The extension context.
 * @param providerWrapper A value that can decorate definition, references, and
 *     hover providers with LSIf and basic intelligence.
 */
async function initLSP(
    ctx: sourcegraph.ExtensionContext,
    providerWrapper: ProviderWrapper
): Promise<boolean> {
    const settings: Settings = sourcegraph.configuration.get().value

    const serverURL = settings['typescript.serverUrl']
    if (!serverURL) {
        return false
    }

    const accessToken = await getOrCreateAccessToken(
        'typescript.accessToken',
        'lang-typescript'
    )
    if (!accessToken) {
        return false
    }

    const { client, featureOptionsSubject } = await registerClient(
        ctx,
        serverURL,
        sourcegraphURL(settings),
        accessToken,
        providerWrapper,
        settings
    )

    const externalReferencesProvider = createExternalReferencesProvider(
        client,
        sourcegraphURL(settings),
        sourcegraph.internal.sourcegraphURL,
        accessToken
    )

    // Immediately register the externalReferencesProvider. This will not
    // change as this extension does not have a setting to disable this
    // functionality.

    featureOptionsSubject.next({
        implementationId: IMPL_ID,
        externalReferencesProvider,
    })

    registerImplementationsPanel(ctx)
    return true
}

/**
 * Return the Sourcegraph URL from the current configuration.
 *
 * @param settings The current settings.
 */
function sourcegraphURL(settings: Settings): URL {
    const url =
        settings['typescript.sourcegraphUrl'] ||
        sourcegraph.internal.sourcegraphURL.toString()

    try {
        return new URL(url)
    } catch (err) {
        if (err.message?.includes('Invalid URL')) {
            console.error(
                new Error(
                    [
                        `Invalid typescript.sourcegraphUrl ${url} in your Sourcegraph settings.`,
                        'Make sure it is set to the address of Sourcegraph from the perspective of the language server (e.g. http://sourcegraph-frontend:30080).',
                        'Read the full documentation for more information: https://github.com/sourcegraph/sourcegraph-typescript',
                    ].join('\n')
                )
            )
        }

        throw err
    }
}

/**
 * Create and register an LSP client. Returns a subject of feature options which can
 * be provided additional values to change the behavior of the client at runtime.
 *
 * @param ctx The extension context.
 * @param serverURL The URL of the LSP server.
 * @param sourcegraphURL The URL of the Sourcegraph API.
 * @param accessToken The access token.
 * @param providerWrapper A value that can decorate definition, references, and
 *     hover providers with LSIF and basic intelligence.
 * @param settings The current settings.
 */
async function registerClient(
    ctx: sourcegraph.ExtensionContext,
    serverURL: string,
    sourcegraphURL: URL,
    accessToken: string,
    providerWrapper: ProviderWrapper,
    settings: Settings
): Promise<{
    client: LSPClient
    featureOptionsSubject: Subject<FeatureOptions>
}> {
    const cancellationTokenSource = new CancellationTokenSource()
    const cancellationToken = cancellationTokenSource.token

    const transport = webSocketTransport({
        serverUrl: serverURL,
        logger: new NoopLogger(),
        cancellationToken,
    })

    const initializationOptions = { configuration: settings }
    const clientToServerURI = (uri: URL): URL =>
        gitToRawApiUri(sourcegraphURL, accessToken, uri)
    const serverToClientURI = rawApiToGitUri

    const featureOptions = new Subject<FeatureOptions>()

    const client = await register({
        sourcegraph,
        transport,
        initializationOptions,
        clientToServerURI,
        serverToClientURI,
        documentSelector,
        providerWrapper,
        featureOptions,
        cancellationToken,
    })

    ctx.subscriptions.add(client)
    ctx.subscriptions.add(() => cancellationTokenSource.cancel())
    return { client, featureOptionsSubject: featureOptions }
}

/**
 * Register a panel view that will hold the results from the LSP implementations provider.
 *
 * @param ctx The extension context.
 */
function registerImplementationsPanel(ctx: sourcegraph.ExtensionContext): void {
    const panelView = sourcegraph.app.createPanelView(IMPL_ID)
    panelView.title = 'Implementations'
    panelView.component = { locationProvider: IMPL_ID }
    panelView.priority = 160
    ctx.subscriptions.add(panelView)
}
