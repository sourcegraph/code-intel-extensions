import * as assert from 'assert'
import * as sourcegraph from 'sourcegraph'
import { resultToLocation, searchResultToResults } from './conversion'

describe('resultToLocation', () => {
    it('converts to a location', () => {
        const location = resultToLocation({
            repo: 'github.com/foo/bar',
            rev: '84bf4aea50d542be71e0e6339ff8e096b35c84e6',
            file: 'bonk/quux.ts',
            start: { line: 10, character: 20 },
            end: { line: 15, character: 25 },
        })

        assert.deepStrictEqual(location, {
            uri: new URL(
                'git://github.com/foo/bar?84bf4aea50d542be71e0e6339ff8e096b35c84e6#bonk/quux.ts'
            ),
            range: new sourcegraph.Range(10, 20, 15, 25),
        })
    })

    it('infers HEAD rev', () => {
        const location = resultToLocation({
            repo: 'github.com/foo/bar',
            rev: '',
            file: 'bonk/quux.ts',
            start: { line: 10, character: 20 },
            end: { line: 15, character: 25 },
        })

        assert.deepStrictEqual(location, {
            uri: new URL('git://github.com/foo/bar?HEAD#bonk/quux.ts'),
            range: new sourcegraph.Range(10, 20, 15, 25),
        })
    })
})

describe('searchResultToResults', () => {
    it('converts to a result list', () => {
        const results = searchResultToResults({
            file: {
                path: 'bonk/quux.ts',
                commit: { oid: '84bf4aea50d542be71e0e6339ff8e096b35c84e6' },
            },
            repository: { name: 'github.com/foo/bar' },
            symbols: [
                {
                    name: 'sym1',
                    fileLocal: true,
                    kind: 'class',
                    location: {
                        resource: { path: 'honk.ts' },
                        range: new sourcegraph.Range(1, 2, 3, 4),
                    },
                },
                {
                    name: 'sym2',
                    fileLocal: false,
                    kind: 'class',
                    location: {
                        resource: { path: 'ronk.ts' },
                        range: new sourcegraph.Range(4, 5, 6, 7),
                    },
                },
                {
                    name: 'sym3',
                    containerName: 'container',
                    fileLocal: true,
                    kind: 'method',
                    location: {
                        resource: { path: 'zonk.ts' },
                        range: new sourcegraph.Range(6, 7, 8, 9),
                    },
                },
            ],
            lineMatches: [
                {
                    preview: 'lets all go to the movies',
                    lineNumber: 20,
                    offsetAndLengths: [[3, 5]],
                },
                {
                    preview: 'and get ourselves some snacks',
                    lineNumber: 40,
                    offsetAndLengths: [
                        [1, 3],
                        [4, 6],
                    ],
                },
            ],
        })

        const common = {
            repo: 'github.com/foo/bar',
            rev: '84bf4aea50d542be71e0e6339ff8e096b35c84e6',
            file: 'bonk/quux.ts',
        }

        assert.deepStrictEqual(results, [
            {
                ...common,
                symbolName: 'sym1',
                symbolKind: 'class',
                file: 'honk.ts',
                fileLocal: true,
                containerName: undefined,
                start: { line: 1, character: 2 },
                end: { line: 3, character: 4 },
            },
            {
                ...common,
                symbolName: 'sym2',
                symbolKind: 'class',
                file: 'ronk.ts',
                fileLocal: false,
                containerName: undefined,
                start: { line: 4, character: 5 },
                end: { line: 6, character: 7 },
            },
            {
                ...common,
                symbolName: 'sym3',
                symbolKind: 'method',
                file: 'zonk.ts',
                fileLocal: true,
                containerName: 'container',
                start: { line: 6, character: 7 },
                end: { line: 8, character: 9 },
            },
            {
                ...common,
                preview: 'lets all go to the movies',
                start: { line: 20, character: 3 },
                end: { line: 20, character: 8 },
            },
            {
                ...common,
                preview: 'and get ourselves some snacks',
                start: { line: 40, character: 1 },
                end: { line: 40, character: 4 },
            },
            {
                ...common,
                preview: 'and get ourselves some snacks',
                start: { line: 40, character: 4 },
                end: { line: 40, character: 10 },
            },
        ])
    })
})
