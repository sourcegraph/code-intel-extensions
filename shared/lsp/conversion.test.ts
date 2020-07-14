import * as assert from 'assert'
import { rewriteUris } from './conversion'

describe('rewriteUris', () => {
    it('rewrites values recursively', () => {
        const obj = {
            foo: [{ uri: 'http://test.com/1' }, { uri: 'http://test.com/2' }, { uri: 'http://test.com/3' }],
            bar: {
                foo: { uri: 'http://test.com/4' },
                bar: { uri: 'http://test.com/5' },
                baz: { uri: 'http://test.com/6' },
            },
            uri: 'http://test.com/7',
            baz: 'bonk',
        }

        rewriteUris(obj, uri => new URL(uri.href + 'x'))

        assert.equal(obj.foo[0].uri, 'http://test.com/1x')
        assert.equal(obj.foo[1].uri, 'http://test.com/2x')
        assert.equal(obj.foo[2].uri, 'http://test.com/3x')
        assert.equal(obj.bar.foo.uri, 'http://test.com/4x')
        assert.equal(obj.bar.bar.uri, 'http://test.com/5x')
        assert.equal(obj.bar.baz.uri, 'http://test.com/6x')
        assert.equal(obj.uri, 'http://test.com/7x')
    })
})
