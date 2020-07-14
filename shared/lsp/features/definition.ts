import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { convertLocations, convertProviderParams, rewriteUris } from '../conversion'
import { Feature } from './feature'

export interface DefinitionFeatureOptions {}

export const definitionFeature: Feature<
    typeof lsp.DefinitionRequest.type,
    'definitionProvider',
    DefinitionFeatureOptions
> = {
    requestType: lsp.DefinitionRequest.type,
    capabilityName: 'definitionProvider',
    register: ({
        sourcegraph,
        connection,
        clientToServerURI,
        serverToClientURI,
        scopedDocumentSelector,
        providerWrapper,
    }) => {
        async function* definition(
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position
        ): AsyncGenerator<sourcegraph.Definition, void, undefined> {
            const result = await connection.sendRequest(
                lsp.DefinitionRequest.type,
                convertProviderParams(textDocument, position, clientToServerURI)
            )
            rewriteUris(result, serverToClientURI)
            yield convertLocations(result)
        }

        return sourcegraph.languages.registerDefinitionProvider(
            scopedDocumentSelector,
            providerWrapper.definition(definition)
        )
    },
}
