import { CancellationTokenSource } from '@sourcegraph/vscode-ws-jsonrpc'
import { Subject } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { activateCodeIntel, initLSP } from '../../../shared/activate'
import { findLanguageSpec } from '../../../shared/language-specs/languages'
import { LSPClient } from '../../../shared/lsp/client'
import { webSocketTransport } from '../../../shared/lsp/connection'
import { FeatureOptions, register } from '../../../shared/lsp/registration'
import { ProviderWrapper } from '../../../shared/providers'
import { gitToRawApiUri, rawApiToGitUri } from '../../../shared/util/uri'
import { Settings } from './settings'
import { createExternalReferencesProvider } from './xrefs'

const documentSelector: sourcegraph.DocumentSelector = [{ language: 'typescript' }, { language: 'javascript' }]

/**
 * Register providers on the extension host.
 *
 * @param ctx The extension context.
 */
export function activate(context: sourcegraph.ExtensionContext): Promise<void> {
    return activateCodeIntel(
        context,
        documentSelector,
        findLanguageSpec('typescript'),
        initLSP('typescript', registerClient, createExternalReferencesProvider)
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
    settings,
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
    /** The current settings. */
    settings: Settings
}): Promise<{
    client: LSPClient
    featureOptionsSubject: Subject<FeatureOptions>
}> {
    const cancellationTokenSource = new CancellationTokenSource()
    const cancellationToken = cancellationTokenSource.token

    const transport = webSocketTransport({
        serverUrl: serverURL,
        cancellationToken,
    })

    const initializationOptions = { configuration: settings }
    const clientToServerURI = (uri: URL): URL => gitToRawApiUri(sourcegraphURL, accessToken, uri)
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
