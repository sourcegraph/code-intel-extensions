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
    uri: 'https://sourcegraph.test/repo@rev/-/raw/foo.ts',
    languageId: 'typescript',
    text: undefined,
})

const pos = new sourcegraph.Position(3, 1)
const range1 = new sourcegraph.Range(1, 2, 3, 4)
// const range2 = new sourcegraph.Range(2, 3, 4, 5)
// const range3 = new sourcegraph.Range(3, 4, 5, 6)

describe('search providers', () => {
    describe('definition provider', () => {
        it('TODO', async () => {
            const api = new API()
            const stub = sinon.stub()
            api.search = stub
            stub.returns([{ repo: '', rev: '', file: '', range: range1 }])

            assert.deepEqual(
                await gatherValues(
                    createProviders(spec, api).definition(
                        { ...doc, text: '\n\n\nfoobar\n' },
                        pos
                    )
                ),
                [
                    [
                    //     new sourcegraph.Location(
                    //         new URL('git://repo1?deadbeef1#/a.ts'),
                    //         range1
                    //     ),
                    //     new sourcegraph.Location(
                    //         new URL('git://repo2?deadbeef2#/b.ts'),
                    //         range2
                    //     ),
                    //     new sourcegraph.Location(
                    //         new URL('git://repo3?deadbeef3#/c.ts'),
                    //         range3
                    //     ),
                    ],
                ]
            )
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
