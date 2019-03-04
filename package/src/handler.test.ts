import * as assert from 'assert'
import { referencesQueries, definitionQueries } from './handler'
import { TextDocument } from 'sourcegraph'

describe('search requests', () => {
    it('makes correct search requests for goto definition', async () => {
        interface DefinitionTest {
            doc: TextDocument
            definitionPatterns?: string[]
            expectedSearchQueries: string[]
        }
        const tests: DefinitionTest[] = [
            {
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.cpp',
                    languageId: 'cpp',
                    text: 'token',
                },
                definitionPatterns: ['const\\s%s\\s='],
                expectedSearchQueries: [
                    // current file
                    'const\\stoken\\s= case:yes file:.(cpp)$ type:file repo:^github.com/foo/bar$@rev file:^file.cpp$',
                    // current repo symbols
                    '^token$ case:yes file:.(cpp)$ type:symbol repo:^github.com/foo/bar$@rev',
                    // current repo definition patterns
                    'const\\stoken\\s= case:yes file:.(cpp)$ type:file repo:^github.com/foo/bar$@rev',
                    // all repos definition patterns
                    'const\\stoken\\s= case:yes file:.(cpp)$ type:file',
                ],
            },
        ]

        for (const test of tests) {
            assert.deepStrictEqual(
                definitionQueries({
                    searchToken: 'token',
                    doc: test.doc,
                    fileExts: ['cpp'],
                    definitionPatterns: test.definitionPatterns || [],
                }),
                test.expectedSearchQueries
            )
        }
    })

    it('makes correct search requests for references', async () => {
        interface ReferencesTest {
            doc: TextDocument
            expectedSearchQueries: string[]
        }
        const tests: ReferencesTest[] = [
            {
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.cpp',
                    languageId: 'cpp',
                    text: 'token',
                },
                expectedSearchQueries: [
                    '\\btoken\\b case:yes file:.(cpp)$ type:file repo:^github.com/foo/bar$@rev',
                    '\\btoken\\b case:yes file:.(cpp)$ type:file -repo:^github.com/foo/bar$',
                ],
            },
        ]

        for (const test of tests) {
            assert.deepStrictEqual(
                referencesQueries({
                    searchToken: 'token',
                    doc: test.doc,
                    fileExts: ['cpp'],
                }),
                test.expectedSearchQueries
            )
        }
    })
})
