import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as sourcegraph from 'sourcegraph'
import * as assert from 'assert'
import {
    asyncGeneratorFromPromise,
    concat,
    flatMapConcurrent,
    observableFromAsyncIterator,
    cachePromiseProvider,
    PROMISE_CACHE_CAPACITY,
} from './ix'

describe('observableFromAsyncIterator', () => {
    it('converts iterator into an observable', async () => {
        const observable = observableFromAsyncIterator(() =>
            (async function* (): AsyncIterator<number> {
                await Promise.resolve()
                yield 1
                yield 2
                yield 3
                yield 4
                yield 5
            })()
        )

        const values: number[] = []
        await new Promise<void>(complete => observable.subscribe({ next: value => values.push(value), complete }))
        assert.deepStrictEqual(values, [1, 2, 3, 4, 5])
    })

    it('throws iterator error', async () => {
        const observable = observableFromAsyncIterator(() =>
            (async function* (): AsyncIterator<number> {
                await Promise.resolve()
                yield 1
                yield 2
                yield 3
                throw new Error('oops')
            })()
        )

        const error = await new Promise(error => observable.subscribe({ error }))
        assert.deepStrictEqual(error, new Error('oops'))
    })
})

describe('concat', () => {
    it('returns all previous values', async () => {
        const iterable = concat(
            (async function* (): AsyncIterable<number[] | null> {
                await Promise.resolve()
                yield [1]
                yield [2, 3]
                yield [4, 5]
            })()
        )

        assert.deepStrictEqual(await gatherValues(iterable), [[1], [1, 2, 3], [1, 2, 3, 4, 5]])
    })

    it('ignores nulls', async () => {
        const iterable = concat(
            (async function* (): AsyncIterable<number[] | null> {
                await Promise.resolve()
                yield null
                yield [1]
                yield null
                yield [2, 3]
                yield [4, 5]
                yield null
            })()
        )

        assert.deepStrictEqual(await gatherValues(iterable), [[1], [1, 2, 3], [1, 2, 3, 4, 5]])
    })
})

describe('flatMapConcurrent', () => {
    it('yields mapped source values', async () => {
        const iterable = flatMapConcurrent([1, 2, 3, 4, 5], 5, async value => Promise.resolve(value * 2))

        assert.deepStrictEqual(await gatherValues(iterable), [2, 4, 6, 8, 10])
    })
})

describe('asyncGeneratorFromPromise', () => {
    it('yields mapped values', async () => {
        const iterable = asyncGeneratorFromPromise(async (value: number) => Promise.resolve(value * 2))

        assert.deepStrictEqual(await gatherValues(iterable(24)), [48])
    })
})

const textDocument1 = createStubTextDocument({
    uri: 'https://sourcegraph.test/repo@rev/-/raw/foo.ts',
    languageId: 'typescript',
    text: undefined,
})
const textDocument2 = createStubTextDocument({
    uri: 'https://sourcegraph.test/repo@rev/-/raw/bar.ts',
    languageId: 'typescript',
    text: undefined,
})

const textDocument3 = createStubTextDocument({
    uri: 'https://sourcegraph.test/repo@rev/-/raw/baz.ts',
    languageId: 'typescript',
    text: undefined,
})

const position1 = new sourcegraph.Position(10, 1)
const position2 = new sourcegraph.Position(10, 2)
const position3 = new sourcegraph.Position(10, 3)

describe('cachePromiseProvider', () => {
    it('caches the result', async () => {
        let calls = 0
        let resolutions = 0

        const cachedPromise = cachePromiseProvider(
            (textDocument: sourcegraph.TextDocument, position: sourcegraph.Position) => {
                calls++

                return new Promise<number>(resolve => {
                    resolutions++
                    resolve(position.line + position.character * 2)
                })
            }
        )

        const promise = cachedPromise(textDocument1, position1)
        assert.strictEqual(await promise, 12)
        assert.strictEqual(await promise, 12)
        assert.strictEqual(await cachedPromise(textDocument2, position2), 14)
        assert.strictEqual(await cachedPromise(textDocument3, position3), 16)
        assert.strictEqual(await cachedPromise(textDocument2, position2), 14)
        assert.strictEqual(await cachedPromise(textDocument1, position1), 12)
        assert.strictEqual(calls, 3)
        assert.strictEqual(resolutions, 3)
    })

    it('is bounded', async () => {
        let calls = 0

        const cachedPromise = cachePromiseProvider(
            (textDocument: sourcegraph.TextDocument, position: sourcegraph.Position) => {
                calls++
                return new Promise<number>(resolve => resolve(position.line + position.character * 2))
            }
        )

        for (let index = 0; index < PROMISE_CACHE_CAPACITY * 2; index++) {
            await cachedPromise(textDocument1, new sourcegraph.Position(index, 1))
        }
        assert.strictEqual(calls, PROMISE_CACHE_CAPACITY * 2)

        // Ensure that the later half are still cached - no new calls
        for (let index = 0; index < PROMISE_CACHE_CAPACITY; index++) {
            await cachedPromise(textDocument1, new sourcegraph.Position(2 * PROMISE_CACHE_CAPACITY - index - 1, 1))
        }
        assert.strictEqual(calls, PROMISE_CACHE_CAPACITY * 2)

        // Ensure that the first half is not cached - all new calls
        for (let index = 0; index < PROMISE_CACHE_CAPACITY; index++) {
            await cachedPromise(textDocument1, new sourcegraph.Position(index, 1))
        }
        assert.strictEqual(calls, PROMISE_CACHE_CAPACITY * 3)
    })
})

async function gatherValues<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const values = []
    for await (const value of iterable) {
        values.push(value)
    }

    return values
}
