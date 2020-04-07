import * as sourcegraph from 'sourcegraph'

/**
 * A wrapper around telemetry events. A new instance of this class
 * should be instantiated at the start of each action as it handles
 * latency tracking.
 */
export class TelemetryEmitter {
    private started: number
    private emitted = new Set<string>()

    constructor() {
        this.started = Date.now()
    }

    /**
     * Emit a telemetry event with a durationMs attribute only if the
     * same action has not yet emitted for this instance.
     */
    public emitOnce(action: string, args: object = {}): Promise<void> {
        if (this.emitted.has(action)) {
            return Promise.resolve()
        }

        this.emitted.add(action)
        return this.emit(action, args)
    }

    /** Emit a telemetry event with a durationMs attribute. */
    public async emit(action: string, args: object = {}): Promise<void> {
        try {
            await sourcegraph.commands.executeCommand(
                'logTelemetryEvent',
                `codeintel.${action}`,
                { ...args, durationMs: this.elapsed() }
            )
        } catch {
            // Older version of Sourcegraph may have not registered this
            // command, causing the promise to reject. We can safely ignore
            // this condition.
        }
    }

    private elapsed(): number {
        return Date.now() - this.started
    }
}
