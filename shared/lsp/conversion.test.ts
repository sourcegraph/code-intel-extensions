import * as assert from 'assert'
import { rewriteUris } from './conversion'

describe('rewriteUris', () => {
    it('rewrites values recursively', () => {
        const object = {
            foo: [{ uri: 'http://test.com/1' }, { uri: 'http://test.com/2' }, { uri: 'http://test.com/3' }],
            bar: {
                foo: { uri: 'http://test.com/4' },
                bar: { uri: 'http://test.com/5' },
                baz: { uri: 'http://test.com/6' },
            },
            uri: 'http://test.com/7',
            baz: 'bonk',
        }

        rewriteUris(object, uri => new URL(uri.href + 'x'))

        assert.equal(object.foo[0].uri, 'http://test.com/1x')
        assert.equal(object.foo[1].uri, 'http://test.com/2x')
        assert.equal(object.foo[2].uri, 'http://test.com/3x')
        assert.equal(object.bar.foo.uri, 'http://test.com/4x')
        assert.equal(object.bar.bar.uri, 'http://test.com/5x')
        assert.equal(object.bar.baz.uri, 'http://test.com/6x')
        assert.equal(object.uri, 'http://test.com/7x')
    })
})
