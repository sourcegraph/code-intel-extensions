import {
    createMessageConnection,
    NotificationType,
    RequestHandler,
    RequestType,
    toSocket,
    WebSocketMessageReader,
    WebSocketMessageWriter,
} from '@sourcegraph/vscode-ws-jsonrpc'
import { attempt } from 'lodash'
import { fromEvent, merge, Subject } from 'rxjs'
import { filter, map, mapTo, take } from 'rxjs/operators'
import { Subscribable, Unsubscribable } from 'sourcegraph'
import { Logger } from './logging'

export interface LSPConnection extends Unsubscribable {
    closed: boolean
    closeEvent: Subscribable<void>
    sendRequest<P, R>(type: RequestType<P, R, any, any>, params: P): Promise<R>
    sendNotification<P>(type: NotificationType<P, any>, params: P): void
    observeNotification<P>(type: NotificationType<P, any>): Subscribable<P>
    setRequestHandler<P, R>(type: RequestType<P, R, any, any>, handler: RequestHandler<P, R, any>): void
}

export const webSocketTransport = ({
    serverUrl,
    logger,
}: {
    serverUrl: string | URL
    logger: Logger
}) => async (): Promise<LSPConnection> => {
    const socket = new WebSocket(serverUrl.toString())
    const event = await merge(fromEvent<Event>(socket, 'open'), fromEvent<Event>(socket, 'error'))
        .pipe(take(1))
        .toPromise()
    if (event.type === 'error') {
        throw new Error(`The WebSocket to the language server at ${serverUrl} could not not be opened`)
    }
    const rpcWebSocket = toSocket(socket)
    const connection = createMessageConnection(
        new WebSocketMessageReader(rpcWebSocket),
        new WebSocketMessageWriter(rpcWebSocket),
        logger
    )
    socket.addEventListener('close', event => {
        logger.warn('WebSocket connection to language server closed', event)
        connection.dispose()
    })
    socket.addEventListener('error', event => {
        logger.error('WebSocket error', event)
    })
    const notifications = new Subject<{ method: string; params: any }>()
    connection.onNotification((method, params) => {
        notifications.next({ method, params })
    })
    connection.listen()
    return {
        get closed(): boolean {
            return socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING
        },
        closeEvent: fromEvent<Event>(socket, 'close').pipe(mapTo(undefined), take(1)),
        sendRequest: async (type, params) => connection.sendRequest(type, params),
        sendNotification: async (type, params) => connection.sendNotification(type, params),
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
