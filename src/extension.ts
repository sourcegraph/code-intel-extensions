import {
    createWebWorkerMessageTransports,
    Worker,
} from 'cxp/module/jsonrpc2/transports/webWorker'
import { InitializeResult } from 'cxp/module/protocol'
import { Connection, createConnection } from 'cxp/module/server/server'
import { Handler } from './handler'

function register(connection: Connection): void {
    let h: Handler
    connection.onInitialize(params => {
        h = new Handler(params)
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
        params => (h ? h.didOpen(params) : undefined)
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
