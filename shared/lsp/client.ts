import { Unsubscribable } from 'rxjs'
import { LSPConnection } from './connection'

export interface LSPClient extends Unsubscribable {
    /**
     * Ensures a connection with the given workspace root, passes it to the given function.
     * If the workspace is not currently open in Sourcegraph, the connection is closed again after the Promise returned by the function resolved.
     *
     * @param workspaceRoot The client workspace folder root URI that will be ensured to be open before calling the function.
     * @param fn Callback that is called with the connection.
     */
    withConnection<R>(workspaceRoot: URL, fn: (connection: LSPConnection) => Promise<R>): Promise<R>
}
