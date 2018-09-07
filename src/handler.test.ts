import * as assert from 'assert'
import { Handler, Config } from './handler'
import { TextDocumentPositionParams } from 'cxp/module/protocol'
import { Result } from './api'

interface ConfigTest {
    input: any
    expConfig: Config
}

describe('config tests', () => {
    it('makes correct config', () => {
        const tests: ConfigTest[] = [
            {
                input: {
                    'basicCodeIntel.sourcegraphToken': 'TOKEN',
                    'basicCodeIntel.definition.symbols': 'local',
                    'basicCodeIntel.debug.traceSearch': true,
                },
                expConfig: {
                    sourcegraphToken: 'TOKEN',
                    definition: {
                        symbols: 'local',
                    },
                    debug: {
                        traceSearch: true,
                    },
                },
            },
            {
                input: {
                    'basicCodeIntel.sourcegraphToken': 'TOKEN',
                },
                expConfig: {
                    sourcegraphToken: 'TOKEN',
                    definition: {
                        symbols: 'no',
                    },
                    debug: {
                        traceSearch: false,
                    },
                },
            },
        ]

        for (const test of tests) {
            const h = new Handler({
                root: null,
                capabilities: {},
                workspaceFolders: [],
                configurationCascade: {
                    merged: { ...test.input },
                },
            })
            assert.deepStrictEqual(test.expConfig, h.config)
        }
    })
    it('requires auth token in config', () => {
        let gotErr = false
        try {
            new Handler({
                root: null,
                capabilities: {},
                workspaceFolders: [],
            })
        } catch (err) {
            gotErr = true
        }
        if (!gotErr) {
            assert.equal(gotErr, true)
        }
    })
})

interface SearchTest {
    symbols?: 'yes' | 'no' | 'local'
    fileContents: Map<string, string>
    reqPositions: TextDocumentPositionParams[]
    expSearchQueries: string[]
}

describe('search requests', () => {
    it('makes correct search requests for goto definition', async () => {
        const tests: SearchTest[] = [
            {
                symbols: 'no',
                fileContents: new Map<string, string>([
                    ['git://github.com/foo/bar?rev#file.c', `token`],
                ]),
                reqPositions: [
                    {
                        textDocument: {
                            uri: 'git://github.com/foo/bar?rev#file.c',
                        },
                        position: { line: 0, character: 0 },
                    },
                ],
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
            {
                symbols: 'yes',
                fileContents: new Map<string, string>([
                    ['git://github.com/foo/bar?rev#file.c', `token`],
                ]),
                reqPositions: [
                    {
                        textDocument: {
                            uri: 'git://github.com/foo/bar?rev#file.c',
                        },
                        position: { line: 0, character: 0 },
                    },
                ],
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:symbol',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
            {
                symbols: 'local',
                fileContents: new Map<string, string>([
                    ['git://github.com/foo/bar?rev#file.c', `token`],
                ]),
                reqPositions: [
                    {
                        textDocument: {
                            uri: 'git://github.com/foo/bar?rev#file.c',
                        },
                        position: { line: 0, character: 0 },
                    },
                ],
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:symbol repo:^github.com/foo/bar$@rev',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file',
                ],
            },
        ]

        for (const test of tests) {
            const h = new Handler({
                root: null,
                capabilities: {},
                workspaceFolders: [],
                configurationCascade: {
                    merged: {
                        'basicCodeIntel.sourcegraphToken': 'TOKEN',
                        'basicCodeIntel.definition.symbols': test.symbols,
                    },
                },
            })
            h.fileContents = test.fileContents
            const searchQueries: string[] = []
            h.api.search = (searchQuery: string): Promise<Result[]> => {
                searchQueries.push(searchQuery)
                return Promise.resolve([])
            }
            for (const p of test.reqPositions) {
                await h.definition(p)
            }
            assert.deepStrictEqual(test.expSearchQueries, searchQueries)
        }
    })

    it('makes correct search requests for references', async () => {
        const tests: SearchTest[] = [
            {
                fileContents: new Map<string, string>([
                    ['git://github.com/foo/bar?rev#file.c', `token`],
                ]),
                reqPositions: [
                    {
                        textDocument: {
                            uri: 'git://github.com/foo/bar?rev#file.c',
                        },
                        position: { line: 0, character: 0 },
                    },
                ],
                expSearchQueries: [
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file repo:^github.com/foo/bar$@rev',
                    '\\btoken\\b case:yes file:.(h|c|hpp|cpp|m|cc)$ type:file -repo:^github.com/foo/bar$',
                ],
            },
        ]

        for (const test of tests) {
            const h = new Handler({
                root: null,
                capabilities: {},
                workspaceFolders: [],
                configurationCascade: {
                    merged: {
                        'basicCodeIntel.sourcegraphToken': 'TOKEN',
                        'basicCodeIntel.definition.symbols': test.symbols,
                    },
                },
            })
            h.fileContents = test.fileContents
            const searchQueries: string[] = []
            h.api.search = (searchQuery: string): Promise<Result[]> => {
                searchQueries.push(searchQuery)
                return Promise.resolve([])
            }
            for (const p of test.reqPositions) {
                await h.references({
                    ...p,
                    context: { includeDeclaration: false },
                })
            }
            assert.deepStrictEqual(test.expSearchQueries, searchQueries)
        }
    })
})
