/**
 * Evaluate each promise sequentially. Return the result of the promise
 * to yield a non-empty set of results. The result of subsequent promises
 * will be ignored.
 *
 * @param ps A list of in-flight promises.
 */
export async function getFirst<T>(...ps: Promise<T[]>[]): Promise<T[]> {
    for (const p of ps) {
        const values = await p
        if (values.length > 0) {
            return values
        }
    }

    return []
}

/**
 * Race an in-flight promise and a promise that will be invoked only after
 * a timeout. This will favor the primary promise, which should be likely
 * to resolve fairly quickly.
 *
 * This is useful for situations where the primary promise may time-out,
 * and the fallback promise returns a value that is likely to be resolved
 * faster but is not as good of a result. This particular situation should
 * _not_ use Promise.race, as the faster promise will always resolve before
 * the one with better results.
 *
 * @param primary The in-flight happy-path promise.
 * @param fallback A factory that creates a fallback promise.
 * @param timeout The timeout in ms before the fallback is invoked.
 */
export async function raceWithDelayOffset<T>(
    primary: Promise<T>,
    fallback: () => Promise<T>,
    timeout: number
): Promise<T> {
    const results = await Promise.race([primary, delay(timeout)])
    if (results !== undefined) {
        return results
    }

    return await Promise.race([primary, fallback()])
}

/**
 * Create a promise that resolves to undefined after the given timeout.
 *
 * @param timeout The timeout in ms.
 */
async function delay(timeout: number): Promise<undefined> {
    return new Promise(r => setTimeout(r, timeout))
}
