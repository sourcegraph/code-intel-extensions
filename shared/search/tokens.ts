/**
 * The default regex for characters allowed in an identifier. It works well for
 * C-like languages (C/C++, C#, Java, etc.) but not for languages that allow
 * punctuation characters (e.g. Ruby).
 */
const DEFAULT_IDENT_CHAR_PATTERN = /[A-Za-z0-9_]/

/**
 * Extract the token that occurs on the given line at the given position. This will
 * scan the line around the current hover position trying to return the maximal set
 * of characters that appear like a symbol given the identifier pattern.
 *
 * @param args Parameter bag.
 */
export function findSearchToken({
    text,
    position,
    lineRegexes,
    identCharPattern = DEFAULT_IDENT_CHAR_PATTERN,
}: {
    /** The text of the current document. */
    text: string
    /** The current hover position. */
    position: { line: number; character: number }
    /** The pattern that identifies a line comment. */
    lineRegexes: RegExp[]
    /** The pattern that identifies identifiers in this language. */
    identCharPattern?: RegExp
}): { searchToken: string; isComment: boolean } | undefined {
    const line = text.split('\n')[position.line]

    // Scan from the current hover position to the right while the characters
    // still match the identifier pattern. If no characters match the pattern
    // then we default to the end of the line.

    let end = line.length
    for (let c = position.character; c < line.length; c++) {
        if (!identCharPattern.test(line[c])) {
            end = c
            break
        }
    }

    // Scan from the current hover position to the left while the characters
    // still match the identifier pattern. If no characters match the pattern
    // then we default to the start of the line.

    let start = 0
    for (let c = position.character; c >= 0; c--) {
        if (!identCharPattern.test(line[c])) {
            start = c + 1
            break
        }
    }

    const searchToken = line.substring(start, end)

    // Determine if the token occurs after a comment on the same line
    const insideComment = lineRegexes.some(lineRegex => {
        const match = line.match(lineRegex)
        if (!match) {
            return false
        }

        return match?.index !== undefined && match.index < start
    })

    if (!insideComment) {
        return { searchToken, isComment: false }
    }

    const blessedPatterns = [
        // looks like a function call
        new RegExp(`${searchToken}\\(`),
        // looks like a field projection
        new RegExp(`\\.${searchToken}`),
        // looks like it's exactly the content of a string
        new RegExp(`('|"|\`)${searchToken}('|"|\`)`),
    ]

    return {
        searchToken,
        // Ensure that we don't have a "blessed" case that we shouldn't
        // count as a comment. These are useful circumstances we do want
        // to search for such as docstring usages.
        isComment: !blessedPatterns.some(pattern => pattern.test(line)),
    }
}
