import * as assert from 'assert'
import { findSearchToken } from './tokens'
import { slashPattern } from '../language-specs/comments'

describe('findSearchToken', () => {
    it('custom identCharPattern', () => {
        assert.deepStrictEqual(
            findSearchToken({
                text: '(defn skip-ws! []',
                position: { line: 0, character: 6 },
                lineRegexes: [],
                identCharPattern: /[A-Za-z0-9_\-!?]/,
            }),
            {
                searchToken: 'skip-ws!',
                isComment: false,
            }
        )
    })

    it('identifies comments after the token', () => {
        assert.deepStrictEqual(
            findSearchToken({
                text: 'foo bar // baz',
                position: { line: 0, character: 5 },
                lineRegexes: [slashPattern],
            }),
            {
                searchToken: 'bar',
                isComment: false,
            }
        )
    })

    it('identifies comments before the token', () => {
        assert.deepStrictEqual(
            findSearchToken({
                text: 'foo // bar baz',
                position: { line: 0, character: 8 },
                lineRegexes: [slashPattern],
            }),
            {
                searchToken: 'bar',
                isComment: true,
            }
        )
    })

    it('special-cases comment content that looks like a function call', () => {
        assert.deepStrictEqual(
            findSearchToken({
                text: 'foo // bar(baz)',
                position: { line: 0, character: 8 },
                lineRegexes: [slashPattern],
            }),
            {
                searchToken: 'bar',
                isComment: false,
            }
        )
    })

    it('special-cases comment content that looks like a field projection', () => {
        assert.deepStrictEqual(
            findSearchToken({
                text: 'foo // .bar baz',
                position: { line: 0, character: 9 },
                lineRegexes: [slashPattern],
            }),
            {
                searchToken: 'bar',
                isComment: false,
            }
        )
    })

    it('special-cases comment content that looks like a string', () => {
        assert.deepStrictEqual(
            findSearchToken({
                text: 'foo // "bar" baz',
                position: { line: 0, character: 9 },
                lineRegexes: [slashPattern],
            }),
            {
                searchToken: 'bar',
                isComment: false,
            }
        )
    })

    it('special-cases comment content that looks EXACTLY like a string', () => {
        assert.deepStrictEqual(
            findSearchToken({
                text: 'foo // "bar baz"',
                position: { line: 0, character: 9 },
                lineRegexes: [slashPattern],
            }),
            {
                searchToken: 'bar',
                isComment: true,
            }
        )
    })
})
