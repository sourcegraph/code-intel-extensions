import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as assert from 'assert'
import * as sourcegraph from 'sourcegraph'
import { definitionQueries, referencesQueries } from './queries'

describe('search requests', () => {
    it('makes correct search requests for goto definition', () => {
        interface DefinitionTest {
            doc: sourcegraph.TextDocument
            expectedSearchQueries: string[]
        }
        const tests: DefinitionTest[] = [
            {
                doc: createStubTextDocument({
                    uri: 'git://github.com/foo/bar?rev#file.cpp',
                    languageId: 'cpp',
                    text: 'token',
                }),
                expectedSearchQueries: [
                    // current repo symbols
                    '^token$ case:yes type:symbol repo:^github.com/foo/bar$@rev file:\\.(cpp)$',
                    // all repo symbols
                    '^token$ case:yes type:symbol file:\\.(cpp)$',
                ],
            },
        ]

        for (const test of tests) {
            assert.deepStrictEqual(
                definitionQueries({
                    searchToken: 'token',
                    doc: test.doc,
                    fileExts: ['cpp'],
                    isSourcegraphDotCom: false,
                }),
                test.expectedSearchQueries
            )
        }
    })

    it('makes correct search requests for references', () => {
        interface ReferencesTest {
            doc: sourcegraph.TextDocument
            expectedSearchQueries: string[]
        }
        const tests: ReferencesTest[] = [
            {
                doc: createStubTextDocument({
                    uri: 'git://github.com/foo/bar?rev#file.cpp',
                    languageId: 'cpp',
                    text: 'token',
                }),
                expectedSearchQueries: [
                    '\\btoken\\b case:yes type:file repo:^github.com/foo/bar$@rev file:\\.(cpp)$',
                    '\\btoken\\b case:yes type:file -repo:^github.com/foo/bar$ file:\\.(cpp)$',
                ],
            },
        ]

        for (const test of tests) {
            assert.deepStrictEqual(
                referencesQueries({
                    searchToken: 'token',
                    doc: test.doc,
                    fileExts: ['cpp'],
                    isSourcegraphDotCom: false,
                }),
                test.expectedSearchQueries
            )
        }
    })
})
