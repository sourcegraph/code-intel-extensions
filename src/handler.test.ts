import * as assert from 'assert'
import { Handler } from './handler'
import { Result } from './api'
import { Position } from 'sourcegraph'

interface SearchTest {
    symbols?: 'local' | 'always'
    doc: {
        uri: string
        text: string
    }
    expSearchQueries: string[]
}

describe('search requests', () => {
    it('makes correct search requests for goto definition', async () => {
        const tests: SearchTest[] = [
            {
                symbols: undefined,
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.c',
                    text: 'token',
                },
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
            {
                symbols: 'always',
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.c',
                    text: 'token',
                },
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:symbol',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
            {
                symbols: 'local',
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.c',
                    text: 'token',
                },
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:symbol repo:^github.com/foo/bar$@rev',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
        ]

        for (const test of tests) {
            const h = new Handler()
            const searchQueries: string[] = []
            h.api.search = (searchQuery: string): Promise<Result[]> => {
                searchQueries.push(searchQuery)
                return Promise.resolve([])
            }
            await h.definition(
                {
                    uri: test.doc.uri,
                    languageId: 'l',
                    text: test.doc.text,
                },
                new Position(0, 0),
                test.symbols
            )
            assert.deepStrictEqual(test.expSearchQueries, searchQueries)
        }
    })

    it('makes correct search requests for references', async () => {
        const tests: SearchTest[] = [
            {
                doc: {
                    uri: 'git://github.com/foo/bar?rev#file.c',
                    text: 'token',
                },
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file repo:^github.com/foo/bar$@rev',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file -repo:^github.com/foo/bar$',
                ],
            },
        ]

        for (const test of tests) {
            const h = new Handler()
            const searchQueries: string[] = []
            h.api.search = (searchQuery: string): Promise<Result[]> => {
                searchQueries.push(searchQuery)
                return Promise.resolve([])
            }
            await h.references(
                {
                    uri: test.doc.uri,
                    languageId: 'l',
                    text: test.doc.text,
                },
                new Position(0, 0)
            )
            assert.deepStrictEqual(test.expSearchQueries, searchQueries)
        }
    })
})
