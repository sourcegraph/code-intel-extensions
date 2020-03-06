import { AsyncIterableX, from, of } from 'ix/asynciterable'
import { MergeAsyncIterable } from 'ix/asynciterable/merge'
import { flatMap, share } from 'ix/asynciterable/operators'
import { Observable, Observer } from 'rxjs'

/**
 * An async generator that yields no values.
 */
export const noopAsyncGenerator = async function*<T>(): AsyncGenerator<
    T,
    void,
    undefined
> {
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
 * @param iterator The source iterator.
 */
export const observableFromAsyncIterator = <T>(
    iterator: AsyncIterator<T>
): Observable<T> =>
    new Observable((observer: Observer<T>) => {
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
                err => {
                    observer.error(err)
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
export async function* concat<T>(
    source: AsyncIterable<T[] | null>
): AsyncIterable<T[] | null> {
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
 * Invoke a map function on each source value concurrently and flatten the results.
 *
 * @param source A list of source values.
 * @param concurrency The number of map functions that can be in-flight at once.
 * @param fn The map function.
 */
export function flatMapConcurrent<T, R>(
    source: T[],
    concurrency: number,
    fn: (value: T) => Promise<R>
): AsyncIterableX<R> {
    return new MergeAsyncIterable(
        new Array<AsyncIterable<R>>(concurrency).fill(
            from(
                of(...source).pipe(
                    share(),
                    flatMap(asyncGeneratorFromPromise(fn))
                )
            )
        )
    )
}

/**
 * Converts a function returning a promise into an async generator yielding the
 * resolved value of that promise.
 *
 * @param fn The promise function.
 */
export function asyncGeneratorFromPromise<P extends unknown[], R>(
    fn: (...args: P) => Promise<R>
): (...args: P) => AsyncGenerator<R, void, unknown> {
    return async function*(...args: P): AsyncGenerator<R, void, unknown> {
        yield await fn(...args)
    }
}
