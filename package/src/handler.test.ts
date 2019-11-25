import * as assert from 'assert'
import {
    referencesQueries,
    definitionQueries,
    findDocstring,
    wrapIndentationInCodeBlocks,
} from './handler'
import { TextDocument } from 'sourcegraph'
import { pythonStyle, cStyle } from '../../languages'
import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'

describe('search requests', () => {
    it('makes correct search requests for goto definition', async () => {
        interface DefinitionTest {
            doc: TextDocument
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
                    '^token$ case:yes file:\\.(cpp)$ type:symbol repo:^github.com/foo/bar$@rev',
                    // all repo symbols
                    '^token$ case:yes file:\\.(cpp)$ type:symbol',
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

    it('makes correct search requests for references', async () => {
        interface ReferencesTest {
            doc: TextDocument
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
                    '\\btoken\\b case:yes file:\\.(cpp)$ type:file repo:^github.com/foo/bar$@rev',
                    '\\btoken\\b case:yes file:\\.(cpp)$ type:file -repo:^github.com/foo/bar$',
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

describe('docstrings', () => {
    it('finds nothing when no comment style is specified', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        def foo():
            """docstring"""
            pass
        `,
                definitionLine: 1,
            }),
            undefined
        )
    })

    it('finds one-line python doc block', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        def foo():
            """docstring"""
            pass
        `,
                definitionLine: 1,
                commentStyle: pythonStyle,
            }),
            'docstring'
        )
    })

    it('finds multi-line python doc block', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        def foo():
            """docstring1
            docstring2"""
            pass
        `,
                definitionLine: 1,
                commentStyle: pythonStyle,
            }),
            'docstring1\ndocstring2'
        )
    })

    it('finds multi-line python doc block 2', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        def foo():
            """docstring1
            docstring2
            """
            pass
        `,
                definitionLine: 1,
                commentStyle: pythonStyle,
            }),
            'docstring1\ndocstring2\n'
        )
    })

    it('finds multi-line python doc block 3', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        def foo():
            """
            docstring1
            docstring2
            """
            pass
        `,
                definitionLine: 1,
                commentStyle: pythonStyle,
            }),
            '\ndocstring1\ndocstring2\n'
        )
    })

    it('finds single-line C doc', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        // docstring
        const foo;
        `,
                definitionLine: 2,
                commentStyle: cStyle,
            }),
            'docstring'
        )
    })

    it('finds multiline single-line C doc', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        // docstring1
        // docstring2
        const foo;
        `,
                definitionLine: 3,
                commentStyle: cStyle,
            }),
            'docstring1\ndocstring2'
        )
    })

    it('finds block C doc 1', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        /* docstring1
         * docstring2
         */
        const foo;
        `,
                definitionLine: 4,
                commentStyle: cStyle,
            }),
            'docstring1\ndocstring2\n'
        )
    })

    it('finds block C doc 2', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        /* docstring1
         * docstring2 */
        const foo;
        `,
                definitionLine: 3,
                commentStyle: cStyle,
            }),
            'docstring1\ndocstring2 '
        )
    })

    it('finds block C doc 3', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        /** docstring1
        *docstring2*/
        const foo;
        `,
                definitionLine: 3,
                commentStyle: cStyle,
            }),
            ' docstring1\ndocstring2'
        )
    })

    it('ignores unrelated code between the docstring and definition line', async () => {
        assert.deepStrictEqual(
            findDocstring({
                fileText: `
        /**
         * docstring
         */
        @Annotation
        public void FizzBuzz()
        `,
                definitionLine: 5,
                commentStyle: cStyle,
                docstringIgnore: /^\s*@/,
            }),
            '\ndocstring\n'
        )
    })
})

describe('wrapping indentation in code blocks', () => {
    it('wraps indentation in code blocks', () => {
        assert.deepStrictEqual(
            wrapIndentationInCodeBlocks({
                languageID: 'java',
                docstring: `
prose

  code

prose
        `,
            }),
            `
prose

\`\`\`java
  code
\`\`\`

prose
        `
        )
    })

    it('wraps indentation in code blocks', () => {
        assert.deepStrictEqual(
            wrapIndentationInCodeBlocks({
                languageID: 'java',
                docstring: `
prose

  code

  code2
        `,
            }),
            `
prose

\`\`\`java
  code

  code2
\`\`\`
        `
        )
    })
})
