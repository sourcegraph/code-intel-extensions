/**
 * Returns true if the given value is not undefined.
 *
 * @param value The value to test.
 */
export function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined
}

/**
 * Ensure that the given value is an array.
 *
 * @param value The list of values, a single value, or null.
 */
export function asArray<T>(value: T | T[] | null): T[] {
    return Array.isArray(value) ? value : value ? [value] : []
}

/**
 * Apply a map function on a single value or over a list of values. Returns the
 * modified result in the same shape as the input.
 *
 * @param value The list of values, a single value, or null.
 * @param fn The map function.
 */
export function mapArrayish<T, R>(
    value: T | T[] | null,
    fn: (value: T) => R
): R | R[] | null {
    return Array.isArray(value) ? value.map(fn) : value ? fn(value) : null
}

/**
 * Removes duplicates and sorts the given list.
 *
 * @param values The input values.
 */
export function sortUnique<T>(values: T[]): T[] {
    const sorted = Array.from(new Set(values))
    sorted.sort()
    return sorted
}

/**
 * Constructs a function that returns true if the input is not in the blacklist.
 * @param blacklist The blacklist.
 */
export function notIn<T>(blacklist: T[]): (v: T) => boolean {
    return (v: T): boolean => !blacklist.includes(v)
}

/**
 * Converts a promise returning a value into a promise returning a value or undefined.
 * Catches any errors that occur during invocation and returns undefined instead of
 * rejecting the promise.
 *
 * @param p The promise.
 */
export function safePromise<P, R>(
    p: (arg: P) => Promise<R>
): (arg: P) => Promise<R | undefined> {
    return async (arg: P): Promise<R | undefined> => {
        try {
            return await p(arg)
        } catch (err) {
            return undefined
        }
    }
}
