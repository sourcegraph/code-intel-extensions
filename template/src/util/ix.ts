import { Observable, Observer } from 'rxjs'
import * as sourcegraph from 'sourcegraph'

/**
 * An async generator that yields no values.
 */
export const noopAsyncGenerator = async function* <T>(): AsyncGenerator<T, void, undefined> {
    /* no-op */
}

export interface AbortError extends Error {
    name: 'AbortError'
}

/**
 * Creates an Error with name "AbortError"
 */
export function createAbortError(): AbortError {
    return Object.assign(new Error('Aborted'), { name: 'AbortError' as const })
}

/**
 * Convert an async iterator into an observable.
 *
 * @param factory A function returning the source iterator.
 */
export const observableFromAsyncIterator = <T>(factory: () => AsyncIterator<T>): Observable<T> =>
    new Observable((observer: Observer<T>) => {
        const iterator = factory()
        let unsubscribed = false
        let iteratorDone = false
        function next(): void {
            iterator.next().then(
                result => {
                    if (unsubscribed) {
                        return
                    }
                    if (result.done) {
                        iteratorDone = true
                        observer.complete()
                    } else {
                        observer.next(result.value)
                        next()
                        return
                    }
                },
                error => {
                    observer.error(error)
                }
            )
        }
        next()
        return () => {
            unsubscribed = true
            if (!iteratorDone && iterator.throw) {
                iterator.throw(createAbortError()).catch(() => {
                    // ignore
                })
            }
        }
    })

/**
 * Modify an async iterable to return an ever-growing list of yielded values. This
 * output matches what is expected from the Sourcegraph extension host for providers,
 * and outputting a changing list will overwrite the previously yielded results. The
 * output generator does not output null values.
 *
 * @param source The source iterable.
 */
export async function* concat<T>(source: AsyncIterable<T[] | null>): AsyncIterable<T[] | null> {
    let allValues: T[] = []
    for await (const values of source) {
        if (!values) {
            continue
        }
        allValues = allValues.concat(values)
        yield allValues
    }
}

/**
 * Converts a function returning a promise into an async generator yielding the
 * resolved value of that promise.
 *
 * @param fn The promise function.
 */
export function asyncGeneratorFromPromise<P extends unknown[], R>(
    func: (...args: P) => Promise<R>
): (...args: P) => AsyncGenerator<R, void, unknown> {
    return async function* (...args: P): AsyncGenerator<R, void, unknown> {
        yield await func(...args)
    }
}

/** The maximum number of promise results to cache. */
export const PROMISE_CACHE_CAPACITY = 5

/**
 * Memoizes a function that returns a promise. Internally, this maintains a simple
 * bounded LRU cache.
 *
 * @param func The promise function.
 */
export function cachePromiseProvider<P extends unknown[], R>(
    func: (...args: P) => Promise<R>,
    cacheCapacity: number = PROMISE_CACHE_CAPACITY
): (...args: P) => Promise<R> {
    interface CacheEntry {
        args: P
        value: Promise<R>
    }
    const cache: CacheEntry[] = []

    return (...args) => {
        for (const [index, entry] of cache.entries()) {
            if (compareProviderArguments(entry.args, args)) {
                if (index !== 0) {
                    cache.splice(index, 1)
                    cache.unshift(entry)
                }
                return entry.value
            }
        }

        const value = func(...args)
        cache.unshift({ args, value })
        while (cache.length > cacheCapacity) {
            cache.pop()
        }
        return value
    }
}

/**
 * Compare the arguments of definition, reference, and hover providers. This
 * will only compare the document and position arguments and will ignore the
 * third parameter on the references provider.
 *
 * @param arguments1 The first set of arguments to compare.
 * @param arguments2 The second set of arguments to compare.
 */
function compareProviderArguments<P extends unknown>(arguments1: P, arguments2: P): boolean {
    const [textDocument1, position1] = arguments1 as [sourcegraph.TextDocument, sourcegraph.Position]
    const [textDocument2, position2] = arguments2 as [sourcegraph.TextDocument, sourcegraph.Position]
    return textDocument1.uri === textDocument2.uri && position1.isEqual(position2)
}
