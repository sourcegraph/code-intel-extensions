import {
    createWebWorkerMessageTransports,
    Worker,
} from 'cxp/module/jsonrpc2/transports/webWorker'
import {
    MessageType,
    InitializeResult,
    ShowMessageNotification,
    ShowMessageParams,
} from 'cxp/module/protocol'
import { Connection, createConnection } from 'cxp/module/server/server'
import { Handler } from './handler'

function register(connection: Connection): void {
    // Either h or initError must be defined after initialization
    let h: Handler, initErr: Error

    const showErr = (connection: Connection): Promise<null> => {
        if (!initErr) {
            throw new Error('Initialization failed, but initErr is undefined')
        }
        connection.sendNotification(ShowMessageNotification.type, {
            type: MessageType.Error,
            message: initErr.toString(),
        } as ShowMessageParams)
        return Promise.resolve(null)
    }

    connection.onInitialize(params => {
        try {
            h = new Handler(params)
        } catch (e) {
            initErr = e
        }
        return {
            capabilities: {
                definitionProvider: true,
                referencesProvider: true,
                textDocumentSync: { openClose: true },
            },
        } as InitializeResult
    })
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

declare var self: Worker
const connection = createConnection(createWebWorkerMessageTransports(self))
register(connection)
connection.listen()
