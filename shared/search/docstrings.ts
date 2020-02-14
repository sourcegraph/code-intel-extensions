import { dropWhile, takeWhile } from 'lodash'
import {
    BlockCommentStyle,
    CommentStyle,
    DocPlacement,
} from '../language-specs/spec'

/**
 * Extract a docstring near the given definition.
 *
 * @param args Parameter bag.
 */
export function findDocstring({
    definitionLine,
    fileText,
    commentStyle,
    docstringIgnore,
}: {
    /** The index of the definition. */
    definitionLine: number
    /** The source of the file. */
    fileText: string
    /** The comment style of the current language. */
    commentStyle?: CommentStyle
    /** An optional pattern to ignore before the docstring. */
    docstringIgnore?: RegExp
}): string | undefined {
    if (!commentStyle) {
        return undefined
    }
    const { lineRegex, block, docPlacement } = commentStyle

    const allLines = fileText.split('\n')

    const sameLineDocstring = findDocstringOnDefinitionLine(
        allLines[definitionLine],
        { lineRegex, block }
    )
    if (sameLineDocstring) {
        return sameLineDocstring
    }

    if (lineRegex) {
        const lineCommentDocstring = findDocstringInLineComments({
            lineRegex,
            lines: mungeLines(allLines, docPlacement, definitionLine),
            docstringIgnore,
        })
        if (lineCommentDocstring) {
            return unmungeLines(lineCommentDocstring, docPlacement).join('\n')
        }
    }

    if (block) {
        // If we've reversed the lines we also need to reverse the
        // block delimiter patterns.

        const modifiedBlock =
            docPlacement === 'below the definition'
                ? block
                : {
                      startRegex: block.endRegex,
                      endRegex: block.startRegex,
                      lineNoiseRegex: block.lineNoiseRegex,
                  }

        const blockCommentDocstring = findDocstringInBlockComment({
            block: modifiedBlock,
            lines: mungeLines(allLines, docPlacement, definitionLine),
            docstringIgnore,
        })
        if (blockCommentDocstring) {
            return unmungeLines(blockCommentDocstring, docPlacement).join('\n')
        }
    }

    return undefined
}

/**
 * Return the content of a comment on this line.
 *
 * @param line The source line.
 * @param commentStyle The comment style of the current language.
 */
function findDocstringOnDefinitionLine(
    line: string,
    { lineRegex, block }: CommentStyle
): string | undefined {
    if (lineRegex) {
        const match = line.match(lineRegex)
        if (match) {
            return match[1]
        }
    }

    if (block) {
        // Match the things between the start and end regex, but not including
        // the endpoints. See https://stackoverflow.com/a/3850095/2061958.
        const blockRegex = new RegExp(
            block.startRegex.source +
                '((?:(?!' +
                block.endRegex.source +
                ').)*)' +
                block.endRegex.source
        )

        const match = line.match(blockRegex)
        if (match) {
            return match[1]
        }
    }

    return undefined
}

/**
 * If the docblock occurs below the definition in this language, then we return the
 * lines after the definition. If it occurs above the definition, we return the lines
 * before the definition in reverse order. This ordering will be undone `unmungeLines`.
 *
 * @param lines The lines of the text document.
 * @param docPlacement The placement of a docblock for the current language.
 * @param definitionLine The line on which the definition occurs.
 */
function mungeLines(
    lines: string[],
    docPlacement: DocPlacement | undefined,
    definitionLine: number
): string[] {
    return docPlacement === 'below the definition'
        ? lines.slice(definitionLine + 1)
        : lines.slice(0, definitionLine).reverse()
}

/**
 * If we reversed the order of the lines in `mungeLines`, undo that here.
 *
 * @param lines The lines of the text document.
 * @param docPlacement The placement of a docblock for the current language.
 */
function unmungeLines(
    lines: string[],
    docPlacement: DocPlacement | undefined
): string[] {
    return docPlacement === 'below the definition' ? lines : lines.reverse()
}

/**
 * Return the content of the docblock following the definition that occurs over
 * a sequence of line comments.
 *
 * @param args Parameter bag.
 */
function findDocstringInLineComments({
    lineRegex,
    lines,
    docstringIgnore,
}: {
    /** The pattern that matches line comments. */
    lineRegex: RegExp
    /** The source lines. */
    lines: string[]
    /** An optional pattern to ignore before the docstring. */
    docstringIgnore?: RegExp
}): string[] | undefined {
    // Add whitespace to the beginning of the line regex
    const pattern = new RegExp(/^\s*/.source + lineRegex.source)

    const docLines = takeWhile(
        // Drop any leading ignored content between the definition and the docstring
        dropWhile(lines, line => docstringIgnore && docstringIgnore.test(line)),
        // Eat all comment lines following the definition
        line => pattern.test(line)
    )

    // If there were any comments, remove the prefixes
    return docLines.length > 0
        ? docLines.map(line => line.replace(pattern, ''))
        : undefined
}

/**
 * Return the content of the docblock following the definition that occurs within
 * a single block comment.
 *
 * @param args Parameter bag.
 */
function findDocstringInBlockComment({
    block: { startRegex, lineNoiseRegex, endRegex },
    lines,
    docstringIgnore,
}: {
    /** The patterns that match the block comment delimiters. */
    block: BlockCommentStyle
    /** The source lines. */
    lines: string[]
    /** An optional pattern to ignore before the docstring. */
    docstringIgnore?: RegExp
}): string[] | undefined {
    const takeWhileInclusive = <T>(
        array: T[],
        predicate: (t: T) => boolean
    ): T[] => {
        const index = array.findIndex(value => !predicate(value))
        return index === -1 ? array : array.slice(0, index + 1)
    }

    // Drop any leading ignored content between the definition and the docstring
    const cleanLines = dropWhile(
        lines,
        line => docstringIgnore && docstringIgnore.test(line)
    )

    // Check for starting delimiter
    if (!cleanLines[0] || !startRegex.test(cleanLines[0])) {
        return undefined
    }

    // Remove starting delimiter from first line only. We need to do this
    // now because we want to additionally include any of the implicit space
    // between the comment delimiter and the comment text in the indentation.

    cleanLines[0] = cleanLines[0].replace(startRegex, '')

    // Eat all comment lines until we find the end delimiter. Notice that we've
    // already removed the opening delimiter. The ordering of these operations
    // are necessary for doc blocks in langauges like Python that have identical
    // open and closing delimiters.

    const docLines = takeWhileInclusive(
        cleanLines,
        line => !endRegex.test(line)
    )

    // Construct a pattern that matches the leading indentation of each
    // line of the block comment. We use the indentation of the first line
    // as a market, which seems correct in the vast majority of cases.

    const indentationPattern = new RegExp(
        `^\\s{0,${docLines[0].length - docLines[0].trimLeft().length}}`
    )

    return docLines.map(line =>
        line
            // Remove ending delimiter
            .replace(endRegex, '')
            // Remove leading indentation
            .replace(indentationPattern, '')
            // Remove line noise
            .replace(lineNoiseRegex || '', '')
    )
}
