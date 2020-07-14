import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { convertHover, convertProviderParameters, rewriteUris } from '../conversion'
import { Feature } from './feature'

export interface HoverFeatureOptions {}

export const hoverFeature: Feature<typeof lsp.HoverRequest.type, 'hoverProvider', HoverFeatureOptions> = {
    capabilityName: 'hoverProvider',
    requestType: lsp.HoverRequest.type,
    register: ({
        sourcegraph,
        connection,
        clientToServerURI,
        serverToClientURI,
        scopedDocumentSelector,
        providerWrapper,
    }) => {
        async function* hover(
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position
        ): AsyncGenerator<sourcegraph.Hover | null, void, undefined> {
            const result = await connection.sendRequest(
                lsp.HoverRequest.type,
                convertProviderParameters(textDocument, position, clientToServerURI)
            )
            rewriteUris(result, serverToClientURI)
            yield convertHover(result)
        }

        return sourcegraph.languages.registerHoverProvider(scopedDocumentSelector, providerWrapper.hover(hover))
    },
}
