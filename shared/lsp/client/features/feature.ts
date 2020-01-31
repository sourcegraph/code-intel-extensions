import { Unsubscribable } from 'sourcegraph'
import { DocumentFilter, DocumentSelector, RequestType, ServerCapabilities } from 'vscode-languageserver-protocol'
import { LSPConnection } from '..'

export interface Feature<R extends RequestType<any, any, any, any>, C extends keyof ServerCapabilities> {
    capabilityName: C
    capabilityToRegisterOptions: (
        capability: ServerCapabilities[C],
        defaultSelector: DocumentSelector
    ) => RegistrationOptions<R>
    requestType: R
    register(options: {
        connection: LSPConnection
        sourcegraph: typeof import('sourcegraph')
        scopeRootUri: URL | null
        clientToServerURI: (uri: URL) => URL
        serverToClientURI: (uri: URL) => URL
        registerOptions: RegistrationOptions<R>
    }): Unsubscribable
}

export type RegistrationOptions<T extends RequestType<any, any, any, any>> = Exclude<T['_'], undefined>[3]

export function scopeDocumentSelectorToRoot(
    documentSelector: DocumentSelector | null,
    clientRootUri: URL | null
): DocumentSelector {
    if (!documentSelector || documentSelector.length === 0) {
        documentSelector = [{ pattern: '**' }]
    }
    if (!clientRootUri) {
        return documentSelector
    }
    return documentSelector
        .map((filter): DocumentFilter => (typeof filter === 'string' ? { language: filter } : filter))
        .map(filter => ({
            ...filter,
            // TODO filter.pattern needs to be run resolved relative to server root URI before mounting on clientRootUri
            pattern: new URL(filter.pattern ?? '**', clientRootUri).href,
        }))
}
