import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as assert from 'assert'
import * as sourcegraph from 'sourcegraph'
import { definitionQuery, referencesQuery } from './queries'

describe('search requests', () => {
    it('makes correct search requests for goto definition', () => {
        interface DefinitionTest {
            doc: sourcegraph.TextDocument
            expectedSearchQuery: string
        }
        const tests: DefinitionTest[] = [
            {
                doc: createStubTextDocument({
                    uri: 'git://github.com/foo/bar?rev#file.cpp',
                    languageId: 'cpp',
                    text: 'token',
                }),
                expectedSearchQuery:
                    '^token$ type:symbol patternType:regexp case:yes file:\\.(cpp)$',
            },
        ]

        for (const test of tests) {
            assert.deepStrictEqual(
                definitionQuery({
                    searchToken: 'token',
                    doc: test.doc,
                    fileExts: ['cpp'],
                }),
                test.expectedSearchQuery
            )
        }
    })

    it('makes correct search requests for references', () => {
        interface ReferencesTest {
            doc: sourcegraph.TextDocument
            expectedSearchQuery: string
        }
        const tests: ReferencesTest[] = [
            {
                doc: createStubTextDocument({
                    uri: 'git://github.com/foo/bar?rev#file.cpp',
                    languageId: 'cpp',
                    text: 'token',
                }),
                expectedSearchQuery:
                    '\\btoken\\b type:file patternType:regexp case:yes file:\\.(cpp)$',
            },
        ]

        for (const test of tests) {
            assert.deepStrictEqual(
                referencesQuery({
                    searchToken: 'token',
                    doc: test.doc,
                    fileExts: ['cpp'],
                }),
                test.expectedSearchQuery
            )
        }
    })
})
