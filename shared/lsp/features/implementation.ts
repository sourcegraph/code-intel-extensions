import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { observableFromAsyncIterator } from '../../util/ix'
import { convertLocations, convertProviderParams, rewriteUris } from '../conversion'
import { Feature } from './feature'
import { reregisterOnChange } from './util'

export interface ImplementationFeatureOptions {
    implementationId: string
}

export const implementationFeature: Feature<
    typeof lsp.ImplementationRequest.type,
    'implementationProvider',
    ImplementationFeatureOptions
> = {
    requestType: lsp.ImplementationRequest.type,
    capabilityName: 'implementationProvider',
    register: ({
        sourcegraph,
        connection,
        clientToServerURI,
        serverToClientURI,
        scopedDocumentSelector,
        featureOptions,
    }) => {
        async function* implementation(
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position
        ): AsyncIterator<sourcegraph.Location[] | null> {
            const result = await connection.sendRequest(
                lsp.ImplementationRequest.type,
                convertProviderParams(textDocument, position, clientToServerURI)
            )
            rewriteUris(result, serverToClientURI)
            yield convertLocations(result)
        }

        return reregisterOnChange(featureOptions, ['implementationId'], options =>
            sourcegraph.languages.registerLocationProvider(
                options.implementationId || 'unknown.impl',
                scopedDocumentSelector,
                {
                    provideLocations: (textDocument: sourcegraph.TextDocument, position: sourcegraph.Position) =>
                        observableFromAsyncIterator(() => implementation(textDocument, position)),
                }
            )
        )
    },
}
