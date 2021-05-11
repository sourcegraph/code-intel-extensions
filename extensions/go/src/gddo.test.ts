// Stub Sourcegraph API
import { createStubSourcegraphAPI } from '@sourcegraph/extension-api-stubs'
import mock from 'mock-require'
mock('sourcegraph', createStubSourcegraphAPI())

import * as assert from 'assert'
import * as sinon from 'sinon'
import { findReposViaGDDO, Response } from './gddo'
import { API } from '../../../shared/util/api'

describe('findReposViaGDDO', () => {
    const trimGitHubPrefix = (url: string) =>
        Promise.resolve({
            id: 5,
            name: url.slice('github.com/'.length),
            isFork: false,
            isArchived: false,
        })

    const makeStubAPI = () => {
        const api = new API()
        const stub = sinon.stub(api, 'resolveRepo')
        stub.callsFake(trimGitHubPrefix)
        return api
    }

    it('requests API', async () => {
        const fetcher = sinon.spy<(url: URL) => Promise<Response>>(() =>
            Promise.resolve({
                results: [
                    { path: 'github.com/foo/baz' },
                    { path: 'github.com/foo/bonk' },
                    { path: 'github.com/foo/quux' },
                ],
            })
        )

        const repos = await findReposViaGDDO('http://gddo', undefined, 'github.com/foo/bar', 5, fetcher, makeStubAPI())

        assert.deepStrictEqual(repos, ['foo/baz', 'foo/bonk', 'foo/quux'])
        sinon.assert.calledWith(fetcher, new URL('http://gddo/importers/github.com/foo/bar'))
    })

    it('requests prepends cors anywhere URL', async () => {
        const fetcher = sinon.spy<(url: URL) => Promise<Response>>(() => Promise.resolve({ results: [] }))

        await findReposViaGDDO('http://gddo', 'http://cors.anywhere/', 'github.com/foo/bar', 5, fetcher, makeStubAPI())

        sinon.assert.calledWith(fetcher, new URL('http://cors.anywhere/http://gddo/importers/github.com/foo/bar'))
    })

    it('filters non-github repos', async () => {
        const repos = await findReposViaGDDO(
            'http://gddo',
            'http://cors.anywhere/',
            'github.com/foo/bar',
            5,
            () =>
                Promise.resolve({
                    results: [
                        { path: 'bitbucket.com/external/foo' },
                        { path: 'github.com/foo/baz' },
                        { path: 'github.com/foo/bonk' },
                        { path: 'gitlab.com/external/bar' },
                        { path: 'github.com/foo/quux' },
                    ],
                }),
            makeStubAPI()
        )

        assert.deepStrictEqual(repos, ['foo/baz', 'foo/bonk', 'foo/quux'])
    })

    it('guards against unknown repos', async () => {
        const api = new API()
        const stub = sinon.stub(api, 'resolveRepo')
        stub.callsFake(url =>
            url === 'github.com/foo/bonk' ? Promise.reject(new Error('unknown repo')) : trimGitHubPrefix(url)
        )

        const repos = await findReposViaGDDO(
            'http://gddo',
            'http://cors.anywhere/',
            'github.com/foo/bar',
            5,
            () =>
                Promise.resolve({
                    results: [
                        { path: 'github.com/foo/baz' },
                        { path: 'github.com/foo/bonk' },
                        { path: 'github.com/foo/quux' },
                    ],
                }),
            api
        )

        assert.deepStrictEqual(repos, ['foo/baz', 'foo/quux'])
    })

    it('limits calls to resolveRepo', async () => {
        const api = new API()
        const stub = sinon.stub(api, 'resolveRepo')
        stub.callsFake(trimGitHubPrefix)

        const repos = await findReposViaGDDO(
            'http://gddo',
            'http://cors.anywhere/',
            'github.com/foo/bar',
            5,
            () =>
                Promise.resolve({
                    results: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(index => ({
                        path: `github.com/foo/${index}`,
                    })),
                }),
            api
        )

        assert.deepStrictEqual(repos, ['foo/1', 'foo/2', 'foo/3', 'foo/4', 'foo/5'])
        sinon.assert.callCount(stub, 5)
    })
})
