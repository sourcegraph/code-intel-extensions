import * as assert from 'assert'
import {
    asyncGeneratorFromPromise,
    concat,
    flatMapConcurrent,
    observableFromAsyncIterator,
} from './ix'

describe('observableFromAsyncIterator', () => {
    it('converts iterator into an observable', async () => {
        const o = observableFromAsyncIterator(
            (async function*(): AsyncIterator<number> {
                await Promise.resolve()
                yield 1
                yield 2
                yield 3
                yield 4
                yield 5
            })()
        )

        const values: number[] = []
        await new Promise(r => o.subscribe(v => values.push(v), undefined, r))
        assert.deepStrictEqual(values, [1, 2, 3, 4, 5])
    })

    it('throws iterator error', async () => {
        const o = observableFromAsyncIterator(
            (async function*(): AsyncIterator<number> {
                await Promise.resolve()
                yield 1
                yield 2
                yield 3
                throw new Error('oops')
            })()
        )

        const err = await new Promise(r => o.subscribe(undefined, r))
        assert.deepStrictEqual(err, new Error('oops'))
    })
})

describe('concat', () => {
    it('returns all previous values', async () => {
        const iterable = concat(
            (async function*(): AsyncIterable<number[] | null> {
                await Promise.resolve()
                yield [1]
                yield [2, 3]
                yield [4, 5]
            })()
        )

        assert.deepStrictEqual(await gatherValues(iterable), [
            [1],
            [1, 2, 3],
            [1, 2, 3, 4, 5],
        ])
    })

    it('ignores nulls', async () => {
        const iterable = concat(
            (async function*(): AsyncIterable<number[] | null> {
                await Promise.resolve()
                yield null
                yield [1]
                yield null
                yield [2, 3]
                yield [4, 5]
                yield null
            })()
        )

        assert.deepStrictEqual(await gatherValues(iterable), [
            [1],
            [1, 2, 3],
            [1, 2, 3, 4, 5],
        ])
    })
})

describe('flatMapConcurrent', () => {
    it('yields mapped source values', async () => {
        const iterable = flatMapConcurrent([1, 2, 3, 4, 5], 5, async x =>
            Promise.resolve(x * 2)
        )

        assert.deepStrictEqual(await gatherValues(iterable), [2, 4, 6, 8, 10])
    })
})

describe('asyncGeneratorFromPromise', () => {
    it('yields mapped values', async () => {
        const iterable = asyncGeneratorFromPromise(async (x: number) =>
            Promise.resolve(x * 2)
        )

        assert.deepStrictEqual(await gatherValues(iterable(24)), [48])
    })
})

async function gatherValues<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const values = []
    for await (const value of iterable) {
        values.push(value)
    }

    return values
}
