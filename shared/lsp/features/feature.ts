import { Observable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { ProviderWrapper } from '../../providers'
import { LSPConnection } from '../connection'

export interface Feature<
    R extends lsp.RequestType<any, any, any, any>,
    C extends keyof lsp.ServerCapabilities,
    O extends object = {}
> {
    capabilityName: C
    requestType: R
    register(options: {
        sourcegraph: typeof import('sourcegraph')
        connection: LSPConnection
        clientToServerURI: (uri: URL) => URL
        serverToClientURI: (uri: URL) => URL
        scopedDocumentSelector: lsp.DocumentSelector
        providerWrapper: ProviderWrapper
        featureOptions: Observable<O>
    }): sourcegraph.Unsubscribable
}
