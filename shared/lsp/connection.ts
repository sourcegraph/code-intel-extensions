import * as jsonrpc from '@sourcegraph/vscode-ws-jsonrpc'
import { attempt } from 'lodash'
import { fromEvent, merge, Subject } from 'rxjs'
import { filter, map, mapTo, take } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { Logger, RedactingLogger } from '../logging'

export interface LSPConnection extends sourcegraph.Unsubscribable {
    closed: boolean
    closeEvent: sourcegraph.Subscribable<void>
    sendRequest<P, R>(type: jsonrpc.RequestType<P, R, any, any>, parameters: P): Promise<R>
    sendNotification<P>(type: jsonrpc.NotificationType<P, any>, parameters: P): void
    observeNotification<P>(type: jsonrpc.NotificationType<P, any>): sourcegraph.Subscribable<P>
    setRequestHandler<P, R>(type: jsonrpc.RequestType<P, R, any, any>, handler: jsonrpc.RequestHandler<P, R, any>): void
}

export const webSocketTransport = ({
    serverUrl,
    cancellationToken,
    logger = new RedactingLogger(console),
}: {
    serverUrl: string | URL
    cancellationToken: jsonrpc.CancellationToken
    logger?: Logger
}) => async (): Promise<LSPConnection> => {
    const socket = new WebSocket(serverUrl.toString())
    const event = await merge(fromEvent<Event>(socket, 'open'), fromEvent<Event>(socket, 'error'))
        .pipe(take(1))
        .toPromise()
    if (event.type === 'error') {
        throw new Error(`The WebSocket to the language server at ${serverUrl.toString()} could not not be opened`)
    }
    const rpcWebSocket = jsonrpc.toSocket(socket)
    const connection = jsonrpc.createMessageConnection(
        new jsonrpc.WebSocketMessageReader(rpcWebSocket),
        new jsonrpc.WebSocketMessageWriter(rpcWebSocket),
        logger
    )
    socket.addEventListener('close', () => {
        logger.warn('WebSocket connection to language server closed')
        connection.dispose()
    })
    socket.addEventListener('error', event => {
        logger.error('WebSocket error', event)
    })
    const notifications = new Subject<{ method: string; params: any }>()
    connection.onNotification((method, parameters) => {
        notifications.next({ method, params: parameters })
    })
    connection.listen()
    return {
        get closed(): boolean {
            return socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING
        },
        closeEvent: fromEvent<Event>(socket, 'close').pipe(mapTo(undefined), take(1)),
        sendRequest: async (type, parameters) => connection.sendRequest(type, parameters, cancellationToken),
        sendNotification: (type, parameters) => connection.sendNotification(type, parameters),
        setRequestHandler: (type, handler) => connection.onRequest(type, handler),
        observeNotification: type =>
            notifications.pipe(
                filter(({ method }) => method === type.method),
                map(({ params }) => params)
            ),
        unsubscribe: () => {
            attempt(() => socket.close())
            attempt(() => connection.dispose())
        },
    }
}
