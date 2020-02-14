import { CancellationTokenSource } from '@sourcegraph/vscode-ws-jsonrpc'
import { BehaviorSubject, from, Observable, Subject } from 'rxjs'
import { distinctUntilChanged, map } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { activateCodeIntel } from '../../../shared/activate'
import { findLanguageSpec } from '../../../shared/language-specs/languages'
import { getOrCreateAccessToken } from '../../../shared/lsp/auth'
import { LSPClient } from '../../../shared/lsp/client'
import { webSocketTransport } from '../../../shared/lsp/connection'
import { NoopLogger } from '../../../shared/lsp/logging'
import { FeatureOptions, register } from '../../../shared/lsp/registration'
import { ProviderWrapper } from '../../../shared/providers'
import { Settings } from './settings'
import { createExternalReferencesProvider } from './xrefs'

const IMPL_ID = 'go.impl'
const documentSelector = [{ language: 'go' }]

/**
 * Register providers on the extension host.
 *
 * @param ctx The extension context.
 */
export function activate(ctx?: sourcegraph.ExtensionContext): Promise<void> {
    return activateCodeIntel(
        ctx,
        documentSelector,
        findLanguageSpec('go'),
        initLSP
    )
}

/**
 * Attempts to register code intelligence providers powered by a language server.
 * Returns true if an LSP client is registered and false otherwise.
 *
 * @param ctx The extension context.
 * @param providerWrapper A value that can decorate definition, references, and
 *     hover providers with LSIF and basic intelligence.
 */
async function initLSP(
    ctx: sourcegraph.ExtensionContext,
    providerWrapper: ProviderWrapper
): Promise<boolean> {
    const { settings, settingsSubject } = getSettings(ctx)

    const serverURL = settings['go.serverUrl']
    if (!serverURL) {
        return false
    }

    const accessToken = await getOrCreateAccessToken('go.accessToken', 'go')
    if (!accessToken) {
        return false
    }

    const { client, featureOptionsSubject } = await registerClient(
        ctx,
        serverURL,
        sourcegraphURL(settings),
        accessToken,
        providerWrapper
    )

    const externalReferencesProvider = createExternalReferencesProvider(
        client,
        settings
    )

    // When the current settings change, determine if we need to supply/revoke
    // the externalReferencesProvider to the LSP client. This will cause the
    // LSP client features to re-register a the references via the extension
    // context.

    ctx.subscriptions.add(
        from(settingsSubject)
            .pipe(
                distinctUntilChanged(),
                map(v => ({
                    implementationId: IMPL_ID,
                    ...(v['go.showExternalReferences']
                        ? { externalReferencesProvider }
                        : {}),
                }))
            )
            .subscribe(featureOptionsSubject)
    )

    registerImplementationsPanel(ctx)
    return true
}

/**
 * Return the current settings and an observable that will yield the settings
 * on change.
 *
 * @param ctx The extension context.
 */
function getSettings(
    ctx: sourcegraph.ExtensionContext
): { settings: Settings; settingsSubject: Observable<Settings> } {
    const settings: Settings = sourcegraph.configuration.get().value
    const settingsSubject: BehaviorSubject<Settings> = new BehaviorSubject<
        Settings
    >(settings)

    ctx.subscriptions.add(
        sourcegraph.configuration.subscribe(() =>
            settingsSubject.next(
                sourcegraph.configuration.get<Settings>().value
            )
        )
    )

    return { settings, settingsSubject }
}

/**
 * Return the Sourcegraph URL from the current configuration.
 *
 * @param settings The current settings.
 */
function sourcegraphURL(settings: Settings): URL {
    const url =
        settings['go.sourcegraphUrl'] ||
        sourcegraph.internal.sourcegraphURL.toString()

    try {
        return new URL(url)
    } catch (err) {
        if (err.message?.includes('Invalid URL')) {
            console.error(
                new Error(
                    [
                        `Invalid go.sourcegraphUrl ${url} in your Sourcegraph settings.`,
                        'Make sure it is set to the address of Sourcegraph from the perspective of the language server (e.g. http://sourcegraph-frontend:30080).',
                        'Read the full documentation for more information: https://github.com/sourcegraph/sourcegraph-go',
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
 */
async function registerClient(
    ctx: sourcegraph.ExtensionContext,
    serverURL: string,
    sourcegraphURL: URL,
    accessToken: string,
    providerWrapper: ProviderWrapper
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

    // Returns a URL template to the raw API (e.g. 'https://%s@localhost:3080/%s@%s/-/raw')
    const { protocol, host } = sourcegraphURL
    const token = accessToken ? accessToken + '@' : ''
    const zipURLTemplate = `${protocol}//${token}${host}/%s@%s/-/raw`
    const initializationOptions = { zipURLTemplate }

    const featureOptions = new Subject<FeatureOptions>()

    const client = await register({
        sourcegraph,
        transport,
        initializationOptions,
        featureOptions,
        documentSelector,
        providerWrapper,
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
    panelView.title = 'Go ifaces/impls'
    panelView.component = { locationProvider: IMPL_ID }
    panelView.priority = 160
    ctx.subscriptions.add(panelView)
}
