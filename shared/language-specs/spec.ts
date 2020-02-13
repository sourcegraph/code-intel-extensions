import * as sourcegraph from 'sourcegraph'

/**
 * TODO
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
     * Regex that matches lines between a definition and the docstring that
     * should be ignored. Java example: `/^\s*@/` for annotations.
     */
    docstringIgnore?: RegExp

    /**
     * Instruction on how to parse comments in order to extract docstrings.
     */
    commentStyle?: CommentStyle

    /**
     * Regex that matches characters in an identifier.
     */
    identCharPattern?: RegExp

    /**
     * Callback that filters the given symbol search results (e.g. to drop
     * results from non-imported files).
     */
    filterDefinitions?: FilterDefinitions
}

/**
 * TODO
 */
export interface CommentStyle {
    /**
     * Specifies where documentation is placed relative to the definition.
     * Defaults to `'above the definition'`. In Python, documentation is placed
     * `'below the definition'`.
     */
    docPlacement?: DocPlacement

    /**
     * Captures the content of a line comment. Also prevents jump-to-definition
     * (except when the token appears to refer to code). Python example:
     * `/#\s?(.*)/`
     */
    lineRegex?: RegExp
    block?: BlockCommentStyle
}

/**
 * TODO
 */
export type DocPlacement = 'above the definition' | 'below the definition'

/**
 * TODO
 */
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

/**
 * TODO
 */
export interface FilterArgs {
    // TODO - see what args are unused
    repo: string
    rev: string
    filePath: string
    fileContent: string
    pos: sourcegraph.Position
    results: Result[]
}

/**
 * TODO
 */
export type FilterDefinitions = (args: FilterArgs) => Result[]

/**
 * Result represents a search result returned from the Sourcegraph API.
 */
export interface Result {
    // TODO - see what can be expressed more cleanly
    repo: string
    rev: string
    file: string
    start: {
        line: number
        character: number
    }
    end: {
        line: number
        character: number
    }
    preview?: string // only for text search results
    symbolName?: string
    symbolKind?: string
    containerName?: string
    fileLocal?: boolean
}

/**
 * TODO
 */
export const nilFilterArgs = {
    repo: '',
    rev: '',
    filePath: '',
    fileContent: '',
    pos: new sourcegraph.Position(0, 0),
    results: [],
}

/**
 * TODO
 */
export const nilResult = {
    repo: '',
    rev: '',
    file: '',
    start: {
        line: 0,
        character: 0,
    },
    end: {
        line: 0,
        character: 0,
    },
}
