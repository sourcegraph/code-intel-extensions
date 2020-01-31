export type CommentStyle = {
    /**
     * Specifies where documentation is placed relative to the definition.
     * Defaults to `'above the definition'`. In Python, documentation is placed
     * `'below the definition'`.
     */
    docPlacement?: 'above the definition' | 'below the definition'

    /**
     * Captures the content of a line comment. Also prevents jump-to-definition
     * (except when the token appears to refer to code). Python example:
     * `/#\s?(.*)/`
     */
    lineRegex?: RegExp
    block?: BlockCommentStyle
}

export interface BlockCommentStyle {
    /**
     * Matches the start of a block comment. C++ example: `/\/\*\*?/`
     */
    startRegex: RegExp
    /**
     * Matches the noise at the beginning of each line in a block comment after
     * the start, end, and leading indentation have been stripped. C++ example:
     * `/(\s\*\s?)?/`
     */
    lineNoiseRegex?: RegExp
    /**
     * Matches the end of a block comment. C++ example: `/\*\//`
     */
    endRegex: RegExp
}
