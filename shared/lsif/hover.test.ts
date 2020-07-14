import * as assert from 'assert'
import * as sinon from 'sinon'
import { QueryGraphQLFn } from '../util/graphql'
import { GenericLSIFResponse } from './api'
import { HoverResponse, hoverForPosition } from './hover'
import { makeEnvelope, range1, document, position } from './util.test'

describe('hoverForPosition', () => {
    it('should correctly parse result', async () => {
        const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>>(() =>
            makeEnvelope({
                hover: {
                    markdown: { text: 'foo' },
                    range: range1,
                },
            })
        )

        assert.deepStrictEqual(await hoverForPosition(document, position, queryGraphQLFn), {
            contents: {
                value: 'foo',
                kind: 'markdown',
            },
            range: range1,
        })
    })

    it('should deal with empty payload', async () => {
        const queryGraphQLFn = sinon.spy<QueryGraphQLFn<GenericLSIFResponse<HoverResponse | null>>>(() =>
            makeEnvelope()
        )

        assert.deepStrictEqual(await hoverForPosition(document, position, queryGraphQLFn), null)
    })
})
