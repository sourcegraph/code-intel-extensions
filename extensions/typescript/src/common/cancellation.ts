import { CancellationToken, CancellationTokenSource } from 'vscode-jsonrpc'
export {
    AbortError,
    isAbortError,
    throwIfAbortError,
} from '../../../../shared/index'
import { createAbortError } from '../../../../shared/index'
export { createAbortError }

/**
 * Throws an AbortError if the given AbortSignal is already aborted
 */
export function throwIfCancelled(token: CancellationToken): void {
    if (token.isCancellationRequested) {
        throw createAbortError()
    }
}

export function tryCancel(token: CancellationTokenSource): void {
    try {
        token.cancel()
    } catch (err) {
        // ignore
    }
}
