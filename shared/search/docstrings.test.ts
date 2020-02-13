import * as assert from 'assert'
import { cStyle, pythonStyle } from '../language-specs/common'
import { findDocstring } from './docstrings'

describe('docstrings', () => {
    it('finds nothing when no comment style is specified', () => {
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

    it('finds one-line python doc block', () => {
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

    it('finds multi-line python doc block', () => {
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

    it('finds multi-line python doc block 2', () => {
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

    it('finds multi-line python doc block 3', () => {
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

    it('finds single-line C doc', () => {
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

    it('finds multiline single-line C doc', () => {
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

    it('finds block C doc 1', () => {
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

    it('finds block C doc 2', () => {
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

    it('finds block C doc 3', () => {
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

    it('ignores unrelated code between the docstring and definition line', () => {
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
