import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as assert from 'assert'
import { afterEach, beforeEach } from 'mocha'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import { cStyleComment } from '../language-specs/comments'
import { LanguageSpec, Result } from '../language-specs/spec'
import { API, SearchResult } from '../util/api'
import { createProviders } from './providers'
import { Providers, SourcegraphProviders } from '../providers'
import { observableFromAsyncIterator } from '../util/ix'

const spec: LanguageSpec = {
    stylized: 'Lang',
    languageID: 'lang',
    fileExts: [],
    commentStyles: [cStyleComment],
    identCharPattern: /./,
    filterDefinitions: <T extends Result>(results: T[]) =>
        results.filter(r => r.file !== '/f.ts'),
}

const doc = createStubTextDocument({
    uri: 'git://sourcegraph.test/repo?rev#/foo.ts',
    languageId: 'typescript',
    text: undefined,
})

const pos = new sourcegraph.Position(3, 1)
const range1 = new sourcegraph.Range(2, 3, 4, 5)
const range2 = new sourcegraph.Range(3, 4, 5, 6)
const range3 = new sourcegraph.Range(4, 5, 6, 7)

const searchResult1 = {
    file: { path: '/a.ts', commit: { oid: 'rev1' } },
    repository: { name: 'repo1' },
    symbols: [
        {
            name: 'sym1',
            fileLocal: false,
            kind: 'class',
            location: { resource: { path: '/b.ts' }, range: range1 },
        },
    ],
    lineMatches: [],
}

const searchResult2 = {
    file: { path: '/c.ts', commit: { oid: 'rev2' } },
    repository: { name: 'repo2' },
    symbols: [
        {
            name: 'sym2',
            fileLocal: false,
            kind: 'class',
            location: { resource: { path: '/d.ts' }, range: range2 },
        },
    ],
    lineMatches: [],
}

const searchResult3 = {
    file: { path: '/e.ts', commit: { oid: 'rev3' } },
    repository: { name: 'repo3' },
    symbols: [
        {
            name: 'sym3',
            fileLocal: false,
            kind: 'class',
            location: { resource: { path: '/f.ts' }, range: range3 },
        },
    ],
    lineMatches: [],
}

const makeNoopPromise = <T>() =>
    new Promise<T>(() => {
        /* block forever */
    })

describe('search providers', () => {
    let tick = 0
    let clock: sinon.SinonFakeTimers | undefined

    /**
     * This creates mocks for the default process timers that will tick
     * 5s ahead every 100ms. This is because there is no good place to
     * call clock.tick explicitly in these tests, and it doesn't hurt
     * (our assertions) to fast forward all time while these tests are
     * running.
     */
    beforeEach(() => {
        tick++
        const currentTick = tick

        const schedule = () => {
            if (tick === currentTick) {
                if (clock) {
                    clock.tick(5000)
                }

                setTimeout(schedule, 100)
            }
        }

        setTimeout(schedule, 100)
        clock = sinon.useFakeTimers()
    })

    afterEach(() => {
        if (clock) {
            clock.restore()
        }

        tick++
    })

    const newAPIWithStubResolveRepo = ({
        isFork = false,
        isArchived = false,
    }: {
        isFork?: boolean
        isArchived?: boolean
    } = {}): API => {
        const api = new API()
        const stub = sinon.stub(api, 'resolveRepo')
        stub.callsFake(repo =>
            Promise.resolve({ name: repo, isFork, isArchived })
        )
        return api
    }

    describe('definition provider', () => {
        it('should correctly parse result', async () => {
            const api = newAPIWithStubResolveRepo()
            const stub = sinon.stub(api, 'search')
            stub.resolves([searchResult1])

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).definition(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 1)
            assertQuery(stub.firstCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])
        })

        it('should fallback to remote definition', async () => {
            const api = newAPIWithStubResolveRepo()
            const stub = sinon.stub(api, 'search')
            stub.callsFake((searchQuery: string) =>
                Promise.resolve(
                    searchQuery.includes('-repo') ? [searchResult1] : []
                )
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).definition(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 2)
            assertQuery(stub.firstCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])
            assertQuery(stub.secondCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:symbol',
            ])
        })

        it('should apply definition filter', async () => {
            const api = newAPIWithStubResolveRepo()
            const stub = sinon.stub(api, 'search')
            stub.resolves([searchResult1, searchResult2, searchResult3])

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).definition(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?rev2#/d.ts'),
                            range2
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 1)
        })

        it('should fallback to index-only queries', async () => {
            const api = newAPIWithStubResolveRepo()
            const stub = sinon.stub(api, 'search')
            stub.callsFake(
                (searchQuery: string): Promise<SearchResult[]> =>
                    searchQuery.includes('index:only')
                        ? Promise.resolve([searchResult1])
                        : makeNoopPromise()
            )

            const values = gatherValues(
                createProviders(spec, {}, api).definition(
                    { ...doc, text: '\n\n\nfoobar\n' },
                    pos
                )
            )

            assert.deepEqual(await values, [
                [
                    new sourcegraph.Location(
                        new URL('git://repo1?rev1#/b.ts'),
                        range1
                    ),
                ],
            ])

            assert.equal(stub.callCount, 2)
            assertQuery(stub.firstCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])
            assertQuery(stub.secondCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$',
                'type:symbol',
                'index:only',
            ])
        })

        it('should fallback to index-only remote definition definition', async () => {
            const api = newAPIWithStubResolveRepo()
            const stub = sinon.stub(api, 'search')
            stub.callsFake(
                (searchQuery: string): Promise<SearchResult[]> =>
                    searchQuery.includes('-repo')
                        ? searchQuery.includes('index:only')
                            ? Promise.resolve([searchResult1])
                            : makeNoopPromise()
                        : Promise.resolve([])
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).definition(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 3)
            assertQuery(stub.firstCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])
            assertQuery(stub.secondCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:symbol',
            ])
            assertQuery(stub.thirdCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:symbol',
                'index:only',
            ])
        })

        it('should search forks in same repo if repo is a fork', async () => {
            const api = newAPIWithStubResolveRepo({ isFork: true })
            const stub = sinon.stub(api, 'search')
            stub.callsFake((searchQuery: string) =>
                Promise.resolve(
                    searchQuery.includes('-repo') ? [searchResult1] : []
                )
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).definition(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 2)
            assertQuery(stub.firstCall.args[0], [
                '^foobar$',
                'case:yes',
                'fork:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])
            assertQuery(stub.secondCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:symbol',
            ])
        })
    })

    describe('references provider', () => {
        it('should correctly parse result', async () => {
            const api = newAPIWithStubResolveRepo()
            const stub = sinon.stub(api, 'search')
            stub.callsFake((searchQuery: string) =>
                Promise.resolve(
                    searchQuery.includes('-repo')
                        ? [searchResult2]
                        : [searchResult1]
                )
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).references(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos,
                        { includeDeclaration: false }
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?rev2#/d.ts'),
                            range2
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 2)
            assertQuery(stub.firstCall.args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:file',
            ])
            assertQuery(stub.secondCall.args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:file',
            ])
        })

        it('should fallback to index-only queries', async () => {
            const api = newAPIWithStubResolveRepo()
            const stub = sinon.stub(api, 'search')

            stub.callsFake(
                (searchQuery: string): Promise<SearchResult[]> =>
                    searchQuery.includes('index:only')
                        ? searchQuery.includes('-repo')
                            ? Promise.resolve([searchResult2])
                            : Promise.resolve([searchResult1])
                        : makeNoopPromise()
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).references(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos,
                        { includeDeclaration: false }
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?rev2#/d.ts'),
                            range2
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 4)
            assertQuery(stub.getCall(0).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:file',
            ])
            assertQuery(stub.getCall(1).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:file',
            ])
            assertQuery(stub.getCall(2).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$',
                'type:file',
                'index:only',
            ])
            assertQuery(stub.getCall(3).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:file',
                'index:only',
            ])
        })

        it('should search forks in same repo if repo is a fork', async () => {
            const api = newAPIWithStubResolveRepo({ isFork: true })
            const stub = sinon.stub(api, 'search')

            stub.callsFake(
                (searchQuery: string): Promise<SearchResult[]> =>
                    searchQuery.includes('index:only')
                        ? searchQuery.includes('-repo')
                            ? Promise.resolve([searchResult2])
                            : Promise.resolve([searchResult1])
                        : makeNoopPromise()
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, {}, api).references(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos,
                        { includeDeclaration: false }
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?rev1#/b.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?rev2#/d.ts'),
                            range2
                        ),
                    ],
                ]
            )

            assert.equal(stub.callCount, 4)
            assertQuery(stub.getCall(0).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'fork:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:file',
            ])
            assertQuery(stub.getCall(1).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:file',
            ])
            assertQuery(stub.getCall(2).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'fork:yes',
                'index:only',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$',
                'type:file',
            ])
            assertQuery(stub.getCall(3).args[0], [
                '\\bfoobar\\b',
                'case:yes',
                'patternType:regexp',
                '-repo:^sourcegraph.test/repo$',
                'type:file',
                'index:only',
            ])
        })
    })

    /** Create providers with the definition provider fed into itself. */
    const recurProviders = (api: API): Providers => {
        const recur: Partial<SourcegraphProviders> = {}
        const providers = createProviders(spec, recur, api)
        recur.definition = {
            provideDefinition: (
                doc: sourcegraph.TextDocument,
                pos: sourcegraph.Position
            ) =>
                observableFromAsyncIterator(() =>
                    providers.definition(doc, pos)
                ),
        }

        return providers
    }

    describe('hover provider', () => {
        it('should correctly parse result', async () => {
            const api = newAPIWithStubResolveRepo()
            const searchStub = sinon.stub(api, 'search')
            searchStub.resolves([searchResult1])
            const getFileContentStub = sinon.stub(api, 'getFileContent')
            getFileContentStub.resolves('text\n// simple docstring\ndef')

            assert.deepEqual(
                await gatherValues(
                    recurProviders(api).hover(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    {
                        contents: {
                            kind: 'markdown',
                            value:
                                '```lang\ndef\n```\n\n---\n\nsimple docstring',
                        },
                    },
                ]
            )

            assert.equal(searchStub.callCount, 1)
            assertQuery(searchStub.firstCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])

            assert.equal(getFileContentStub.callCount, 1)
            assert.deepEqual(getFileContentStub.firstCall.args, [
                'repo1',
                'rev1',
                '/b.ts',
            ])
        })

        it('should fallback to index-only queries', async () => {
            const api = newAPIWithStubResolveRepo()
            const searchStub = sinon.stub(api, 'search')
            searchStub.callsFake((searchQuery: string) =>
                searchQuery.includes('index:only')
                    ? Promise.resolve([searchResult1])
                    : makeNoopPromise()
            )

            const getFileContentStub = sinon.stub(api, 'getFileContent')
            getFileContentStub.resolves('text\n// simple docstring\ndef')

            assert.deepEqual(
                await gatherValues(
                    recurProviders(api).hover(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    {
                        contents: {
                            kind: 'markdown',
                            value:
                                '```lang\ndef\n```\n\n---\n\nsimple docstring',
                        },
                    },
                ]
            )

            assert.equal(searchStub.callCount, 2)
            assertQuery(searchStub.firstCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])
            assertQuery(searchStub.secondCall.args[0], [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$',
                'type:symbol',
                'index:only',
            ])

            assert.equal(getFileContentStub.callCount, 1)
            assert.deepEqual(getFileContentStub.firstCall.args, [
                'repo1',
                'rev1',
                '/b.ts',
            ])
        })
    })
})

function assertQuery(searchQuery: string, expectedTerms: string[]): void {
    const actualTerms = searchQuery.split(' ').filter(p => !!p)
    actualTerms.sort()
    expectedTerms.sort()
    assert.deepEqual(actualTerms, expectedTerms)
}

async function gatherValues<T>(g: AsyncGenerator<T>): Promise<T[]> {
    const values: T[] = []
    for await (const v of g) {
        values.push(v)
    }
    return values
}
