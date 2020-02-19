import * as assert from 'assert'
import { getFirst } from './promises'

describe('getFirst', () => {
    it('returns first non-empty array', async () => {
        const results = await getFirst(
            Promise.resolve([]),
            Promise.resolve([1, 2, 3]),
            Promise.resolve([4, 5, 6])
        )

        assert.deepStrictEqual(results, [1, 2, 3])
    })
})
