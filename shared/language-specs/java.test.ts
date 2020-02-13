import * as assert from 'assert'
import { javaSpec } from './java'
import { nilFilterContext, nilResult } from './spec'

const fileContent = `
package com.sourcegraph.test.codeintel;

import com.sourcegraph.test.foo;
import com.sourcegraph.test.sub.bar;
import static com.sourcegraph.test.sub.sub.baz.Ident;
`

const prefix = 'src/java/com/sourcegraph/test'

describe('javaSpec', () => {
    it('filters definitions', () => {
        const results = [
            { ...nilResult, file: `${prefix}/foo/file.java` },
            { ...nilResult, file: `${prefix}/sub/bar/file.java` },
            { ...nilResult, file: `${prefix}/sub/sub/baz/file.java` },
            { ...nilResult, file: `${prefix}/codeintel/baz.java` },

            // incorrect file
            { ...nilResult, file: `${prefix}/bonk/file.java` },
            // incorrect paths
            { ...nilResult, file: `${prefix}/sub/foo/file.java` },
            { ...nilResult, file: `${prefix}/foo/sub/file.java` },
        ]

        const filtered =
            javaSpec.filterDefinitions &&
            javaSpec.filterDefinitions(results, {
                ...nilFilterContext,
                fileContent,
            })

        assert.deepStrictEqual(filtered, [
            results[0],
            results[1],
            results[2],
            results[3],
        ])
    })
})
