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
 * @param makeFallback A factory that creates a fallback promise.
 * @param timeout The timeout in ms before the fallback is invoked.
 * @param filter An optional filter function to determine if a set of results
 *        should be returned immediately.
 */
export async function raceWithDelayOffset<T>(
    primary: Promise<T>,
    makeFallback: () => Promise<T>,
    timeout: number,
    filter: (v: T) => boolean = v => v !== null
): Promise<T> {
    const primaryResults = await Promise.race([primary, delay(timeout)])
    if (primaryResults !== undefined && filter(primaryResults)) {
        return primaryResults
    }

    const fallback = makeFallback()
    const raceResults = await Promise.race([primary, fallback])
    if (filter(raceResults)) {
        return raceResults
    }

    return fallback
}

/**
 * Create a promise that resolves to undefined after the given timeout.
 *
 * @param timeout The timeout in ms.
 */
async function delay(timeout: number): Promise<undefined> {
    return new Promise(r => setTimeout(r, timeout))
}
