import { Observable, Subject } from 'rxjs'
import * as sinon from 'sinon'

export const stubTransport = (server: Record<string, (params: any) => any>) =>
    sinon.spy(() => {
        const closeEvent = new Subject<void>()
        let closed = false
        return {
            sendNotification: sinon.spy(),
            sendRequest: sinon.spy(async ({ method }, params) => {
                if (method in server) {
                    return (server as any)[method](params)
                }
                throw new Error('Unhandled method ' + method)
            }),
            observeNotification: () => new Observable<never>(),
            setRequestHandler: sinon.spy(),
            closeEvent,
            unsubscribe: sinon.spy(() => {
                closeEvent.next()
                closeEvent.complete()
                closed = true
            }),
            get closed(): boolean {
                return closed
            },
        }
    })
