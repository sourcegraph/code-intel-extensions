export type LogLevel = 'error' | 'warn' | 'info' | 'log'
export type Logger = Record<LogLevel, (...values: any[]) => void>

/** Logger implementation that does nothing.*/
export class NoopLogger {
    public error(): void {
        /* no-op */
    }

    public warn(): void {
        /* no-op */
    }

    public info(): void {
        /* no-op */
    }

    public log(): void {
        /* no-op */
    }
}
