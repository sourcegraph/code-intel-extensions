import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as assert from 'assert'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import { QueryGraphQLFn } from '../util/graphql'
import {
    createGraphQLProviders as createProviders,
    DefinitionResponse,
    GenericLSIFResponse,
    HoverResponse,
    MAX_REFERENCE_PAGE_REQUESTS,
    ReferencesResponse,
} from './providers'

const doc = createStubTextDocument({
    uri: 'git://repo@ref#/foo.ts',
    languageId: 'typescript',
    text: undefined,
})

const makeResource = (name: string, oid: string, path: string) => ({
    repository: { name },
    commit: { oid },
    path,
})

const pos = new sourcegraph.Position(5, 10)
const range1 = new sourcegraph.Range(1, 2, 3, 4)
const range2 = new sourcegraph.Range(2, 3, 4, 5)
const range3 = new sourcegraph.Range(3, 4, 5, 6)
const range4 = new sourcegraph.Range(4, 5, 6, 7)
const range5 = new sourcegraph.Range(5, 6, 7, 8)
const range6 = new sourcegraph.Range(6, 7, 8, 9)

const resource0 = makeResource('repo', 'rev', '/foo.ts')
const resource1 = makeResource('repo1', 'deadbeef1', '/a.ts')
const resource2 = makeResource('repo2', 'deadbeef2', '/b.ts')
const resource3 = makeResource('repo3', 'deadbeef3', '/c.ts')

const makeEnvelope = <R>(
    value: R | null = null
): Promise<GenericLSIFResponse<R | null>> =>
    Promise.resolve({
        repository: {
            commit: {
                blob: {
                    lsif: value,
                },
            },
        },
    })

describe('graphql providers', () => {
    describe('definition provider', () => {
        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>
            >(() =>
                makeEnvelope({
                    definitions: {
                        nodes: [
                            { resource: resource1, range: range1 },
                            { resource: resource2, range: range2 },
                            { resource: resource3, range: range3 },
                        ],
                    },
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).definition(doc, pos)
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?deadbeef1#/a.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?deadbeef2#/b.ts'),
                            range2
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo3?deadbeef3#/c.ts'),
                            range3
                        ),
                    ],
                ]
            )
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>
            >(() => makeEnvelope())

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).definition(doc, pos)
                ),
                [null]
            )
        })
    })

    describe('references provider', () => {
        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>
            >(() =>
                makeEnvelope({
                    references: {
                        nodes: [
                            { resource: resource1, range: range1 },
                            { resource: resource2, range: range2 },
                            { resource: resource3, range: range3 },
                        ],
                        pageInfo: {},
                    },
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).references(doc, pos, {
                        includeDeclaration: false,
                    })
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?deadbeef1#/a.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?deadbeef2#/b.ts'),
                            range2
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo3?deadbeef3#/c.ts'),
                            range3
                        ),
                    ],
                ]
            )
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>
            >(() => makeEnvelope())

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).references(doc, pos, {
                        includeDeclaration: false,
                    })
                ),
                []
            )
        })

        it('should paginate results', async () => {
            const stub = sinon.stub<
                Parameters<
                    QueryGraphQLFn<
                        GenericLSIFResponse<ReferencesResponse | null>
                    >
                >,
                ReturnType<
                    QueryGraphQLFn<
                        GenericLSIFResponse<ReferencesResponse | null>
                    >
                >
            >()
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>
            >(stub)

            stub.onCall(0).returns(
                makeEnvelope({
                    references: {
                        nodes: [{ resource: resource1, range: range1 }],
                        pageInfo: { endCursor: 'page2' },
                    },
                })
            )
            stub.onCall(1).returns(
                makeEnvelope({
                    references: {
                        nodes: [{ resource: resource2, range: range2 }],
                        pageInfo: { endCursor: 'page3' },
                    },
                })
            )
            stub.onCall(2).returns(
                makeEnvelope({
                    references: {
                        nodes: [{ resource: resource3, range: range3 }],
                        pageInfo: {},
                    },
                })
            )

            const location1 = new sourcegraph.Location(
                new URL('git://repo1?deadbeef1#/a.ts'),
                range1
            )
            const location2 = new sourcegraph.Location(
                new URL('git://repo2?deadbeef2#/b.ts'),
                range2
            )
            const location3 = new sourcegraph.Location(
                new URL('git://repo3?deadbeef3#/c.ts'),
                range3
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).references(doc, pos, {
                        includeDeclaration: false,
                    })
                ),
                [
                    [location1],
                    [location1, location2],
                    [location1, location2, location3],
                ]
            )

            assert.equal(queryGraphQLFn.getCall(0).args[1]?.after, undefined)
            assert.equal(queryGraphQLFn.getCall(1).args[1]?.after, 'page2')
            assert.equal(queryGraphQLFn.getCall(2).args[1]?.after, 'page3')
        })

        it('should not page results indefinitely', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>
            >(() =>
                makeEnvelope({
                    references: {
                        nodes: [{ resource: resource1, range: range1 }],
                        pageInfo: { endCursor: 'infinity' },
                    },
                })
            )

            const location = new sourcegraph.Location(
                new URL('git://repo1?deadbeef1#/a.ts'),
                range1
            )

            const values = [[location]]
            for (let i = 1; i < MAX_REFERENCE_PAGE_REQUESTS; i++) {
                const lastCopy = Array.from(values[values.length - 1])
                lastCopy.push(location)
                values.push(lastCopy)
            }

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).references(doc, pos, {
                        includeDeclaration: false,
                    })
                ),
                values
            )

            assert.equal(queryGraphQLFn.callCount, MAX_REFERENCE_PAGE_REQUESTS)
        })
    })

    describe('hover provider', () => {
        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>
            >(() =>
                makeEnvelope({
                    hover: {
                        markdown: { text: 'foo' },
                        range: range1,
                    },
                })
            )

            assert.deepStrictEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).hover(doc, pos)
                ),
                [
                    {
                        contents: {
                            value: 'foo',
                            kind: 'markdown',
                        },
                        range: range1,
                    },
                ]
            )
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>
            >(() => makeEnvelope())

            assert.deepStrictEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).hover(doc, pos)
                ),
                [null]
            )
        })
    })

    describe('document highlights provider', () => {
        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>
            >(() =>
                makeEnvelope({
                    references: {
                        nodes: [
                            { resource: resource0, range: range1 },
                            { resource: resource1, range: range2 },
                            { resource: resource0, range: range3 },
                            { resource: resource2, range: range4 },
                            { resource: resource0, range: range5 },
                            { resource: resource3, range: range6 },
                        ],
                        pageInfo: {},
                    },
                })
            )

            console.log(
                await gatherValues(
                    createProviders(queryGraphQLFn).documentHighlights(doc, pos)
                )
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).documentHighlights(doc, pos)
                ),
                [[{ range: range1 }, { range: range3 }, { range: range5 }]]
            )
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>
            >(() => makeEnvelope())

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).documentHighlights(doc, pos)
                ),
                [null]
            )
        })
    })
})

async function gatherValues<T>(g: AsyncGenerator<T>): Promise<T[]> {
    const values: T[] = []
    for await (const v of g) {
        values.push(v)
    }
    return values
}
