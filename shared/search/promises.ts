/**
 * Return the result of the first promise to yield a non-empty
 * set of results.
 *
 * @param ps A list of in-flight promises.
 */
export async function getFirst<T>(...ps: Promise<T[]>[]): Promise<T[]> {
    for (const p of ps) {
        const locations = await p
        if (locations.length > 0) {
            return locations
        }
    }

    return []
}
