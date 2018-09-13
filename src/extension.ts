import { createWebWorkerMessageTransports } from 'sourcegraph/module/jsonrpc2/transports/webWorker'
import {
    SourcegraphExtensionAPI,
    activateExtension,
    MessageType,
    ShowMessageNotification,
    ShowMessageParams,
    RegistrationParams,
    RegistrationRequest,
} from 'sourcegraph'
import { Handler } from './handler'
import { MessageConnection } from 'sourcegraph/module/jsonrpc2/connection'

function run(sourcegraph: SourcegraphExtensionAPI<any>): void {
    const connection = sourcegraph.rawConnection

    // Either h or initError must be defined after initialization
    let h: Handler, initErr: Error

    const showErr = (connection: MessageConnection): Promise<null> => {
        if (!initErr) {
            throw new Error('Initialization failed, but initErr is undefined')
        }
        connection.sendNotification(ShowMessageNotification.type, {
            type: MessageType.Error,
            message: initErr.toString(),
        } as ShowMessageParams)
        return Promise.resolve(null)
    }

    try {
        h = new Handler(sourcegraph.initializeParams)
    } catch (e) {
        initErr = e
    }

    connection.sendRequest(RegistrationRequest.type, {
        registrations: [
            {
                id: 'def',
                method: 'textDocument/definition',
                registerOptions: { documentSelector: ['*'] },
            },
            {
                id: 'ref',
                method: 'textDocument/references',
                registerOptions: { documentSelector: ['*'] },
            },
        ],
    } as RegistrationParams)

    connection.onNotification(
        'textDocument/didOpen',
        params => (h ? h.didOpen(params) : showErr(connection))
    )
    connection.onRequest(
        'textDocument/definition',
        params => (h ? h.definition(params) : null)
    )
    connection.onRequest(
        'textDocument/references',
        params => (h ? h.references(params) : null)
    )
}

// This runs in a Web Worker and communicates using postMessage with the page.
activateExtension<any>(
    createWebWorkerMessageTransports(self as DedicatedWorkerGlobalScope),
    run
)
