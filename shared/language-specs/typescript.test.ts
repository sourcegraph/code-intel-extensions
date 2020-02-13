import * as assert from 'assert'
import { nilFilterArgs, nilResult } from './spec'
import { typescriptSpec } from './typescript'

const fileContent = `
import { a, b, c } from "./bar"
const d = require('../../shared/baz')
`

describe('typescriptSpec', () => {
    it('filters definitions', () => {
        const results = [
            { ...nilResult, file: 'a/b/c/bar.ts' },
            { ...nilResult, file: 'a/b/c/bar.js' },
            { ...nilResult, file: 'a/shared/baz.ts' },
            // { ...nilResult, file: 'a/shared/baz/index.ts' }, // TODO - support this

            // incorrect file
            { ...nilResult, file: 'a/b/c/baz.ts' },
            // incorrect paths
            { ...nilResult, file: 'x/y/z/bar.ts' },
            { ...nilResult, file: 'a/b/shared/baz.ts' },
        ]

        const filtered =
            typescriptSpec.filterDefinitions &&
            typescriptSpec.filterDefinitions({
                ...nilFilterArgs,
                filePath: 'a/b/c/foo.ts',
                fileContent,
                results,
            })

        assert.deepStrictEqual(filtered, [
            results[0],
            results[1],
            results[2],
            // results[3],
        ])
    })
})
