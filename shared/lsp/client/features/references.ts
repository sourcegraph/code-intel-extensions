import { ReferencesRequest } from 'vscode-languageserver-protocol'
import { convertLocations, convertProviderParams, rewriteUris } from '../lsp-conversion'
import { Feature, scopeDocumentSelectorToRoot } from './feature'

export const referencesFeature: Feature<typeof ReferencesRequest.type, 'referencesProvider'> = {
    requestType: ReferencesRequest.type,
    capabilityName: 'referencesProvider',
    capabilityToRegisterOptions: (capability, defaultSelector) => ({ documentSelector: defaultSelector }),
    register: ({ sourcegraph, connection, scopeRootUri, clientToServerURI, serverToClientURI, registerOptions }) =>
        sourcegraph.languages.registerReferenceProvider(
            scopeDocumentSelectorToRoot(registerOptions.documentSelector, scopeRootUri),
            {
                provideReferences: async (textDocument, position, context) => {
                    const result = await connection.sendRequest(ReferencesRequest.type, {
                        ...convertProviderParams({ textDocument, position }, { clientToServerURI }),
                        context,
                    })
                    rewriteUris(result, serverToClientURI)
                    return convertLocations(sourcegraph, result)
                },
            }
        ),
}
