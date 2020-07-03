import * as assert from 'assert'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import { QueryGraphQLFn } from '../util/graphql'
import { createGraphQLProviders as createProviders } from './providers'
import { GenericLSIFResponse } from './api'
import { DefinitionResponse } from './definition'
import { ReferencesResponse, MAX_REFERENCE_PAGE_REQUESTS } from './references'
import { HoverResponse } from './hover'
import {
    gatherValues,
    makeEnvelope,
    resource1,
    resource2,
    resource3,
    range1,
    range2,
    range3,
    doc,
    pos,
} from './util.test'

describe('graphql providers', () => {
    describe('definition provider', () => {
        it('should use result from window', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>
            >(() => makeEnvelope(null))

            const getBulkLocalIntelligence = Promise.resolve(() =>
                Promise.resolve({
                    range: range1,
                    definitions: [
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
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(
                        queryGraphQLFn,
                        getBulkLocalIntelligence
                    ).definition(doc, pos)
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
        it('should use result from window', async () => {
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

            const getBulkLocalIntelligence = Promise.resolve(() =>
                Promise.resolve({
                    range: range1,
                    references: [
                        new sourcegraph.Location(
                            new URL('git://repo1?deadbeef1#/d.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?deadbeef2#/e.ts'),
                            range2
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo3?deadbeef3#/f.ts'),
                            range3
                        ),
                    ],
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(
                        queryGraphQLFn,
                        getBulkLocalIntelligence
                    ).references(doc, pos, { includeDeclaration: false })
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo1?deadbeef1#/d.ts'),
                            range1
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo2?deadbeef2#/e.ts'),
                            range2
                        ),
                        new sourcegraph.Location(
                            new URL('git://repo3?deadbeef3#/f.ts'),
                            range3
                        ),
                    ],
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
        it('should use result from window', async () => {
            const queryGraphQLFn = sinon.spy<
                QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>
            >(() => makeEnvelope(null))

            const getBulkLocalIntelligence = Promise.resolve(() =>
                Promise.resolve({
                    range: range1,
                    hover: {
                        markdown: { text: 'foo' },
                        range: range1,
                    },
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(
                        queryGraphQLFn,
                        getBulkLocalIntelligence
                    ).hover(doc, pos)
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
})
