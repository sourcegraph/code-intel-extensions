import * as assert from 'assert'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import { QueryGraphQLFn } from '../util/graphql'
import { createGraphQLProviders as createProviders } from './providers'
import { GenericLSIFResponse } from './api'
import { DefinitionResponse, definitionForPosition } from './definition'
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

describe('definitionForPosition', () => {
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
            await definitionForPosition(doc, pos, queryGraphQLFn),
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
