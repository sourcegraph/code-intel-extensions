import { CancellationTokenSource } from '@sourcegraph/vscode-ws-jsonrpc'
import { Subject } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { activateCodeIntel, initLSP } from '../../../shared/activate'
import { findLanguageSpec } from '../../../shared/language-specs/languages'
import { NoopLogger } from '../../../shared/logging'
import { LSPClient } from '../../../shared/lsp/client'
import { webSocketTransport } from '../../../shared/lsp/connection'
import { FeatureOptions, register } from '../../../shared/lsp/registration'
import { ProviderWrapper } from '../../../shared/providers'
import { createExternalReferencesProvider } from './xrefs'

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
        initLSP('go', registerClient, createExternalReferencesProvider)
    )
}

/**
 * Create and register an LSP client. Returns a subject of feature options which can
 * be provided additional values to change the behavior of the client at runtime.
 *
 * @param args Parameter bag.
 */
async function registerClient({
    ctx,
    serverURL,
    sourcegraphURL,
    accessToken,
    providerWrapper,
}: {
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
}): Promise<{
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
