import { merge } from 'ix/asynciterable'
import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { ReferencesProvider } from '../../providers'
import { concat, noopAsyncGenerator } from '../../util/ix'
import {
    convertLocations,
    convertProviderParams,
    rewriteUris,
} from '../conversion'
import { Feature } from './feature'
import { reregisterOnChange } from './util'

export interface ReferencesFeatureOptions {
    externalReferencesProvider?: ReferencesProvider
}

export const referencesFeature: Feature<
    typeof lsp.ReferencesRequest.type,
    'referencesProvider',
    ReferencesFeatureOptions
> = {
    requestType: lsp.ReferencesRequest.type,
    capabilityName: 'referencesProvider',
    register: ({
        sourcegraph,
        connection,
        clientToServerURI,
        serverToClientURI,
        scopedDocumentSelector,
        providerWrapper,
        featureOptions,
    }) => {
        async function* localReferences(
            textDocument: sourcegraph.TextDocument,
            position: sourcegraph.Position,
            context: sourcegraph.ReferenceContext
        ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
            const params = convertProviderParams(
                textDocument,
                position,
                clientToServerURI
            )
            const result = await connection.sendRequest(
                lsp.ReferencesRequest.type,
                { ...params, context }
            )
            rewriteUris(result, serverToClientURI)
            yield convertLocations(result) || []
        }

        const references = (
            externalReferences: ReferencesProvider
        ): ReferencesProvider =>
            async function*(
                textDocument: sourcegraph.TextDocument,
                position: sourcegraph.Position,
                context: sourcegraph.ReferenceContext
            ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
                yield* concat(
                    merge(
                        localReferences(textDocument, position, context),
                        externalReferences(textDocument, position, context)
                    )
                )
            }

        return reregisterOnChange(
            featureOptions,
            ['externalReferencesProvider'],
            ({ externalReferencesProvider = noopAsyncGenerator }) =>
                sourcegraph.languages.registerReferenceProvider(
                    scopedDocumentSelector,
                    providerWrapper.references(
                        references(externalReferencesProvider)
                    )
                )
        )
    },
}
