import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as assert from 'assert'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import { LanguageSpec } from '../language-specs/spec'
import { API } from '../util/api'
import { createProviders } from './providers'

const spec: LanguageSpec = {
    stylized: 'Test',
    languageID: 'test',
    fileExts: [],
    commentStyles: [],
    identCharPattern: /./,
}

const doc = createStubTextDocument({
    uri: 'git://sourcegraph.test/repo?rev#/foo.ts',
    languageId: 'typescript',
    text: undefined,
})

const pos = new sourcegraph.Position(3, 1)
const range1 = new sourcegraph.Range(1, 2, 3, 4)
// const range2 = new sourcegraph.Range(2, 3, 4, 5)
// const range3 = new sourcegraph.Range(3, 4, 5, 6)

describe('search providers', () => {
    describe('definition provider', () => {
        it.only('TODO', async () => {
            const api = new API()
            const stub = sinon.stub()
            const spy = sinon.spy<API['search']>(stub)
            api.search = spy

            // TODO - also test non-repo

            stub.returns([
                {
                    file: {
                        path: '/a.ts',
                        commit: {
                            oid: 'rev',
                        },
                    },
                    repository: { name: 'repo' },
                    symbols: [
                        {
                            name: 'sym1',
                            fileLocal: false,
                            kind: 'class',
                            location: {
                                resource: { path: '/b.ts' },
                                range: range1,
                            },
                        },
                    ],
                    lineMatches: [],
                },
            ])

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, api).definition(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    [
                        new sourcegraph.Location(
                            new URL('git://repo?rev#/b.ts'),
                            range1
                        ),
                    ],
                ]
            )

            const queryParts = spy.firstCall.args[0].split(' ').filter(p => !!p)
            queryParts.sort()
            assert.deepEqual(queryParts, [
                '^foobar$',
                'case:yes',
                'patternType:regexp',
                'repo:^sourcegraph.test/repo$@rev',
                'type:symbol',
            ])
        })
    })

    describe('references provider', () => {
        // TODO
    })

    describe('hover provider', () => {
        // TODO
    })
})

async function gatherValues<T>(g: AsyncGenerator<T>): Promise<T[]> {
    const values: T[] = []
    for await (const v of g) {
        values.push(v)
    }
    return values
}
