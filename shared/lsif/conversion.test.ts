import * as assert from 'assert'
import * as sourcegraph from 'sourcegraph'
import { nodeToLocation } from './conversion'

describe('nodeToLocation', () => {
    it('converts to a location', () => {
        const range = new sourcegraph.Range(10, 12, 10, 15)

        const location = nodeToLocation({
            resource: {
                repository: { name: 'github.com/foo/bar' },
                commit: { oid: '4a245ea3d5e0f947affb4fc65bf4af7a0c708299' },
                path: 'baz/bonk/quux.ts',
            },
            range,
        })

        assert.deepStrictEqual(location, {
            uri: new URL(
                'git://github.com/foo/bar?4a245ea3d5e0f947affb4fc65bf4af7a0c708299#baz/bonk/quux.ts'
            ),
            range,
        })
    })
})
