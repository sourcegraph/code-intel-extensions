import * as assert from 'assert'
import * as sinon from 'sinon'
import { findPackageName, PackageJson, resolvePackageRepo } from './package'
import { API } from '../../../shared/util/api'

describe('resolvePackageRepo', () => {
    it('resolves string repo', async () => {
        const api = new API()
        const mock = sinon.stub(api, 'resolveRepo')
        mock.callsFake(repo => Promise.resolve({ id: 1, name: repo, isFork: false, isArchived: false }))
        const name = await resolvePackageRepo('{"repository": "foo"}', api)
        assert.equal(name, 'foo')
        sinon.assert.calledWith(mock, 'foo')
    })

    it('resolves repos with url', async () => {
        const api = new API()
        const mock = sinon.stub(api, 'resolveRepo')
        mock.callsFake(repo => Promise.resolve({ id: 1, name: repo, isFork: false, isArchived: false }))
        const name = await resolvePackageRepo('{"repository": {"url": "foo"}}', api)
        assert.equal(name, 'foo')
        sinon.assert.calledWith(mock, 'foo')
    })

    it('resolves repos without repo field', async () => {
        const api = new API()
        const mock = sinon.stub(api, 'resolveRepo')
        mock.callsFake(repo => Promise.resolve({ id: 1, name: repo, isFork: false, isArchived: false }))
        const name = await resolvePackageRepo('{}', api)
        assert.equal(name, undefined)
        sinon.assert.notCalled(mock)
    })

    it('guards against unknown repos', async () => {
        const api = new API()
        const mock = sinon.stub(api, 'resolveRepo')
        mock.rejects(new Error('unknown repo'))
        const name = await resolvePackageRepo('{"repository": "foo"}', api)
        assert.equal(name, undefined)
        sinon.assert.called(mock)
    })
})

describe('findPackageName', () => {
    it('reads from package.json', async () => {
        const fetcher = sinon.spy<(url: URL, headers?: Record<string, string>) => Promise<PackageJson>>(() =>
            Promise.resolve({
                name: 'foobar',
            })
        )

        const name = await findPackageName(new URL('http://package/foo/bar.ts'), fetcher)
        assert.equal(name, 'foobar')
        sinon.assert.calledWith(fetcher, new URL('http://package/foo/package.json'), {})
    })

    it('falls back to parent package.json', async () => {
        const notFoundError = Object.assign(new Error('not found'), { code: 404 })

        const fetcher = sinon.stub()
        fetcher.onCall(0).returns(Promise.reject(notFoundError))
        fetcher.onCall(1).returns(Promise.reject(notFoundError))
        fetcher.returns(Promise.resolve({ name: 'foobar' }))

        const name = await findPackageName(new URL('http://package/foo/bar/baz/bonk/quux.ts'), fetcher)
        assert.equal(name, 'foobar')
        sinon.assert.callCount(fetcher, 3)

        const expected = [
            'http://package/foo/bar/baz/bonk/package.json',
            'http://package/foo/bar/baz/package.json',
            'http://package/foo/bar/package.json',
        ]

        for (const url of expected) {
            sinon.assert.calledWith(fetcher, new URL(url), {})
        }
    })

    it('throws error on server error', async () => {
        const serverError = Object.assign(new Error('server error'), {
            code: 500,
        })

        const fetcher = sinon.stub()
        fetcher.returns(Promise.reject(serverError))

        try {
            await findPackageName(new URL('http://package/foo/bar/baz/bonk/quux.ts'), fetcher)
            assert.fail('Expected exception')
        } catch (error) {
            assert.deepStrictEqual(error, serverError)
        }
    })

    it('throws error on failure', async () => {
        const notFoundError = Object.assign(new Error('not found'), { code: 404 })

        const fetcher = sinon.stub()
        fetcher.returns(Promise.reject(notFoundError))

        try {
            await findPackageName(new URL('http://package/foo/bar/baz/bonk/quux.ts'), fetcher)
            assert.fail('Expected exception')
        } catch {
            // pass
        }
    })

    it('reads requests with access tokens', async () => {
        const fetcher = sinon.spy<(url: URL, headers?: Record<string, string>) => Promise<PackageJson>>(() =>
            Promise.resolve({
                name: 'foobar',
            })
        )

        const name = await findPackageName(new URL('http://deadbeef@package/foo/bar.ts'), fetcher)
        assert.equal(name, 'foobar')
        sinon.assert.calledWith(fetcher, new URL('http://package/foo/package.json'), {
            Authorization: 'token deadbeef',
        })
    })

    it('special-cases DefinitelyTyped', async () => {
        const fetcher = sinon.stub()
        const name = await findPackageName(
            new URL(
                'http://package/node_modules/DefinitelyTyped/DefinitelyTyped/types/something/long/path/is/ignored.ts'
            ),
            fetcher
        )
        assert.equal(name, '@types/something')
        sinon.assert.notCalled(fetcher)
    })
})
