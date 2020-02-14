/**
 * The specification used to provide search-based code intelligence for a
 * particular language. This includes things like file extensions, comment
 * patterns and delimiters, and logic for filtering out obviously wrong
 * search results for definitions.
 */
export interface LanguageSpec {
    /**
     * Used to label markdown code blocks.
     */
    languageID: string

    /**
     * The name of the generated extension.
     */
    stylized: string

    /**
     * The part of the filename after the `.` (e.g. `cpp` in `main.cpp`).
     */
    fileExts: string[]

    /**
     * Regex that matches individual characters in an identifier.
     */
    identCharPattern?: RegExp

    /**
     * Instruction on how to parse comments in order to extract docstrings.
     */
    commentStyle?: CommentStyle

    /**
     * Regex that matches lines between a definition and the docstring that
     * should be ignored. Java example: `/^\s*@/` for annotations.
     */
    docstringIgnore?: RegExp

    /**
     * Callback that filters the given symbol search results (e.g. to drop
     * results from non-imported files).
     */
    filterDefinitions?: FilterDefinitions
}

/**
 * Comment patterns and delimiters for a particular language.
 */
export interface CommentStyle {
    /**
     * Captures the content of a line comment. Also prevents jump-to-definition
     * (except when the token appears to refer to code). Python example:
     * `/#\s?(.*)/`
     */
    lineRegex?: RegExp

    /**
     * The style of block comments.
     */
    block?: BlockCommentStyle

    /**
     * Specifies where documentation is placed relative to the definition.
     * Defaults to `'above the definition'`. In Python, documentation is placed
     * `'below the definition'`.
     */
    docPlacement?: DocPlacement
}

/**
 * Where a docstring is located relative to a definition.
 */
export type DocPlacement = 'above the definition' | 'below the definition'

/**
 * Block comment delimiter patterns for a particular language.
 */
export interface BlockCommentStyle {
    /**
     * Matches the start of a block comment. C++ example: `/\/\*\*?/`
     */
    startRegex: RegExp

    /**
     * Matches the end of a block comment. C++ example: `/\*\//`
     */
    endRegex: RegExp

    /**
     * Matches the noise at the beginning of each line in a block comment after
     * the start, end, and leading indentation have been stripped. C++ example:
     * `/(\s\*\s?)?/`
     */
    lineNoiseRegex?: RegExp
}

/**
 * A filter function that prunes imprecise definitions from search results.
 */
export type FilterDefinitions = <T extends Result>(
    results: T[],
    context: FilterContext
) => T[]

/**
 * Additional context supplied when filtering search results.
 */
export interface FilterContext {
    /**
     * The name of the repository containing of the current file.
     */
    repo: string

    /**
     * The path to the current file relative to the repository root.
     */
    filePath: string

    /**
     * The full text content of the current file.
     */
    fileContent: string
}

/**
 * Result represents a search result returned from the Sourcegraph API.
 */
export interface Result {
    /**
     * The name of the repository containing the result.
     */
    repo: string

    /**
     * The path to the result file relative to the repository root.
     */
    file: string
}
