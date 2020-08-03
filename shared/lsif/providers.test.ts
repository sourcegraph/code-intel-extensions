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
    resource0,
    resource1,
    resource2,
    resource3,
    range1,
    range2,
    range3,
    range4,
    range5,
    range6,
    document,
    position,
} from './util.test'
import { DefinitionAndHoverResponse } from './definition-hover'

describe('graphql providers', () => {
    describe('combined definition and hover provider', () => {
        it('should use result from window', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<DefinitionAndHoverResponse | null>>>(
                () => makeEnvelope(null)
            )

            const getBulkLocalIntelligence = Promise.resolve(() =>
                Promise.resolve({
                    range: range1,
                    definitions: [
                        new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                    ],
                    hover: {
                        markdown: { text: 'foo' },
                        range: range1,
                    },
                })
            )

            assert.deepEqual(
                await createProviders(queryGraphQLFn, getBulkLocalIntelligence).definitionAndHover(document, position),
                {
                    definition: [
                        new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                    ],
                    hover: {
                        contents: {
                            value: 'foo',
                            kind: 'markdown',
                        },
                        range: range1,
                    },
                }
            )
        })

        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<DefinitionAndHoverResponse | null>>>(
                () =>
                    makeEnvelope({
                        definitions: {
                            nodes: [
                                { resource: resource1, range: range1 },
                                { resource: resource2, range: range2 },
                                { resource: resource3, range: range3 },
                            ],
                        },
                        hover: {
                            markdown: { text: 'foo' },
                            range: range1,
                        },
                    })
            )

            assert.deepEqual(await createProviders(queryGraphQLFn).definitionAndHover(document, position), {
                definition: [
                    new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                    new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                    new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                ],
                hover: {
                    contents: {
                        value: 'foo',
                        kind: 'markdown',
                    },
                    range: range1,
                },
            })
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<DefinitionAndHoverResponse | null>>>(
                () => makeEnvelope()
            )

            assert.deepEqual(await createProviders(queryGraphQLFn).definitionAndHover(document, position), null)
        })
    })

    describe('definition provider', () => {
        it('should use result from window', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>>(() =>
                makeEnvelope(null)
            )

            const getBulkLocalIntelligence = Promise.resolve(() =>
                Promise.resolve({
                    range: range1,
                    definitions: [
                        new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                    ],
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn, getBulkLocalIntelligence).definition(document, position)
                ),
                [
                    [
                        new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                    ],
                ]
            )
        })

        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>>(() =>
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

            assert.deepEqual(await gatherValues(createProviders(queryGraphQLFn).definition(document, position)), [
                [
                    new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                    new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                    new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                ],
            ])
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>>(() =>
                makeEnvelope()
            )

            assert.deepEqual(await gatherValues(createProviders(queryGraphQLFn).definition(document, position)), [null])
        })
    })

    describe('references provider', () => {
        it('should use result from window', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>(() =>
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
                        new sourcegraph.Location(new URL('git://repo1?deadbeef1#/d.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo2?deadbeef2#/e.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo3?deadbeef3#/f.ts'), range3),
                    ],
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn, getBulkLocalIntelligence).references(document, position, {
                        includeDeclaration: false,
                    })
                ),
                [
                    [
                        new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                    ],
                ]
            )
        })

        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>(() =>
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
                    createProviders(queryGraphQLFn).references(document, position, {
                        includeDeclaration: false,
                    })
                ),
                [
                    [
                        new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3),
                    ],
                ]
            )
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>(() =>
                makeEnvelope()
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).references(document, position, {
                        includeDeclaration: false,
                    })
                ),
                []
            )
        })

        it('should paginate results', async () => {
            const stub = sinon.stub<
                Parameters<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>,
                ReturnType<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>
            >()
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>(stub)

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

            const location1 = new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1)
            const location2 = new sourcegraph.Location(new URL('git://repo2?deadbeef2#/b.ts'), range2)
            const location3 = new sourcegraph.Location(new URL('git://repo3?deadbeef3#/c.ts'), range3)

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).references(document, position, {
                        includeDeclaration: false,
                    })
                ),
                [[location1], [location1, location2], [location1, location2, location3]]
            )

            assert.equal(queryGraphQLFn.getCall(0).args[1]?.after, undefined)
            assert.equal(queryGraphQLFn.getCall(1).args[1]?.after, 'page2')
            assert.equal(queryGraphQLFn.getCall(2).args[1]?.after, 'page3')
        })

        it('should not page results indefinitely', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>(() =>
                makeEnvelope({
                    references: {
                        nodes: [{ resource: resource1, range: range1 }],
                        pageInfo: { endCursor: 'infinity' },
                    },
                })
            )

            const location = new sourcegraph.Location(new URL('git://repo1?deadbeef1#/a.ts'), range1)

            const values = [[location]]
            for (let index = 1; index < MAX_REFERENCE_PAGE_REQUESTS; index++) {
                const lastCopy = [...values[values.length - 1]]
                lastCopy.push(location)
                values.push(lastCopy)
            }

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn).references(document, position, {
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
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>>(() =>
                makeEnvelope(null)
            )

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
                await gatherValues(createProviders(queryGraphQLFn, getBulkLocalIntelligence).hover(document, position)),
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
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>>(() =>
                makeEnvelope({
                    hover: {
                        markdown: { text: 'foo' },
                        range: range1,
                    },
                })
            )

            assert.deepStrictEqual(await gatherValues(createProviders(queryGraphQLFn).hover(document, position)), [
                {
                    contents: {
                        value: 'foo',
                        kind: 'markdown',
                    },
                    range: range1,
                },
            ])
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>>(() =>
                makeEnvelope()
            )

            assert.deepStrictEqual(await gatherValues(createProviders(queryGraphQLFn).hover(document, position)), [
                null,
            ])
        })
    })

    describe('document highlights provider', () => {
        it('should use result from window', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<DefinitionResponse | null>>>(() =>
                makeEnvelope(null)
            )

            const getBulkLocalIntelligence = Promise.resolve(() =>
                Promise.resolve({
                    range: range1,
                    references: [
                        new sourcegraph.Location(new URL('git://repo?rev#foo.ts'), range1),
                        new sourcegraph.Location(new URL('git://repo?rev#bar.ts'), range2),
                        new sourcegraph.Location(new URL('git://repo?rev#foo.ts'), range3),
                        new sourcegraph.Location(new URL('git://repo?rev#baz.ts'), range4),
                        new sourcegraph.Location(new URL('git://repo?rev#foo.ts'), range5),
                        new sourcegraph.Location(new URL('git://repo?rev#baz.ts'), range6),
                    ],
                })
            )

            assert.deepEqual(
                await gatherValues(
                    createProviders(queryGraphQLFn, getBulkLocalIntelligence).documentHighlights(document, position)
                ),
                [[{ range: range1 }, { range: range3 }, { range: range5 }]]
            )
        })

        it('should correctly parse result', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>(() =>
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
            assert.deepEqual(
                await gatherValues(createProviders(queryGraphQLFn).documentHighlights(document, position)),
                [[{ range: range1 }, { range: range3 }, { range: range5 }]]
            )
        })

        it('should deal with empty payload', async () => {
            const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<ReferencesResponse | null>>>(() =>
                makeEnvelope()
            )
            assert.deepEqual(
                await gatherValues(createProviders(queryGraphQLFn).documentHighlights(document, position)),
                [null]
            )
        })
    })
})
