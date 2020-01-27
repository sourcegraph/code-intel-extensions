export interface AbortError extends Error {
    name: 'AbortError'
}

/**
 * Creates an Error with name "AbortError"
 */
export const createAbortError = (): AbortError =>
    Object.assign(new Error('Aborted'), { name: 'AbortError' as const })

/**
 * Returns true if the given value is an AbortError
 */
export const isAbortError = (err: any): err is AbortError =>
    typeof err === 'object' && err !== null && err.name === 'AbortError'

export function throwIfAbortError(err: unknown): void {
    if (isAbortError(err)) {
        throw err
    }
}
