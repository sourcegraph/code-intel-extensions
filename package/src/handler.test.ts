import * as assert from 'assert'
import { referencesQueries } from './handler'
import { TextDocument } from 'sourcegraph'

interface SearchTest {
    crossRepo?: boolean
    doc: TextDocument
    expectedSearchQueries: string[]
}

describe('search requests', () => {
    it('makes correct search requests for goto definition', async () => {
        const tests: SearchTest[] = [
            {
                crossRepo: undefined,
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.c',
                    languageId: 'cpp',
                    text: 'token',
                },
                expectedSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
            {
                crossRepo: true,
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.c',
                    languageId: 'cpp',
                    text: 'token',
                },
                expectedSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:symbol',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
            {
                crossRepo: false,
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.c',
                    languageId: 'cpp',
                    text: 'token',
                },
                expectedSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:symbol repo:^github.com/foo/bar$@rev',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
        ]

        for (const test of tests) {
            assert.deepStrictEqual(test.expectedSearchQueries, searchQueries)
        }
    })

    it('makes correct search requests for references', async () => {
        const tests: SearchTest[] = [
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
