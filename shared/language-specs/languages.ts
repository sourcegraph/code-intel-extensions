import * as path from 'path'
import * as sourcegraph from 'sourcegraph'

export interface LanguageSpec {
    /**
     * Used to label markdown code blocks.
     */
    languageID: string

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

export type FilterDefinitions = (args: {
    repo: string
    rev: string
    filePath: string
    fileContent: string
    pos: sourcegraph.Position
    results: Result[]
}) => Result[]

/**
 * Result represents a search result returned from the Sourcegraph API.
 */
export interface Result {
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

export type DocPlacement = 'above the definition' | 'below the definition'

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

const cStyleBlock: any = {
    startRegex: /\/\*\*?/,
    lineNoiseRegex: /(^\s*\*\s?)?/,
    endRegex: /\*\//,
}

export const cStyle: CommentStyle = {
    lineRegex: /\/\/\/?\s?/,
    block: cStyleBlock,
}

const shellStyle: CommentStyle = {
    lineRegex: /#\s?/,
}

export const pythonStyle: CommentStyle = {
    docPlacement: 'below the definition',
    lineRegex: /#\s?/,
    block: {
        startRegex: /"""/,
        endRegex: /"""/,
    },
}

const lispStyle: CommentStyle = {
    docPlacement: 'below the definition',
    block: {
        startRegex: /"/,
        endRegex: /"/,
    },
}

/**
 * Filter a list of candidate definitions to select those likely to be valid
 * cross-references for a definition in this file. Accept candidates located in
 * files that are a suffix match (ignoring file extension) for some import of
 * the current file.
 *
 * For imports we examine user `#include` and `#import` paths, as well as
 * Objective C module `@import` package names. If no candidates match, fall
 * back to the raw (unfiltered) results so that the user doesn't get an empty
 * response unless there really is nothing.
 */
const cppFilterDefinitions: LanguageSpec['filterDefinitions'] = ({
    filePath,
    fileContent,
    results,
}) => {
    const imports = fileContent
        .split(/\r?\n/)
        .map(line => {
            // Rewrite `@import x.y.z;` as x/y/z to simulate path matching.
            // In plain C and C++ files, expect this to be empty.
            const matchImport = /^@import (\w+);$/.exec(line)
            if (matchImport) {
                return matchImport[1].replace(/\./g, '/')
            }

            // Capture paths from #include and #import directives.
            // N.B. Only user paths ("") are captured, not system (<>) paths.
            return /^#(include|import) "(.*)"$/.exec(line)?.[2]
        })
        .filter((x): x is string => Boolean(x))

    // Select results whose file path shares a suffix with some import.
    // N.B. Paths are compared without file extensions.
    const filteredResults = results.filter(result => {
        const resultParsed = path.parse(result.file)
        const candidate = path.join(resultParsed.dir, resultParsed.name)
        return imports.some(i => {
            const iParsed = path.parse(i)
            return candidate.endsWith(path.join(iParsed.dir, iParsed.name))
        })
    })

    return filteredResults.length === 0 ? results : filteredResults
}

// The set of languages come from https://madnight.github.io/githut/#/pull_requests/2018/4
// The language names come from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
// The extensions come from shared/src/languages.ts
export const languageSpecs: LanguageSpec[] = [
    {
        languageID: 'typescript',
        stylized: 'TypeScript',
        fileExts: ['ts', 'tsx', 'js', 'jsx'],
        commentStyle: cStyle,
        filterDefinitions: ({ filePath, fileContent, results }) => {
            const imports = fileContent
                .split('\n')
                .map(line => {
                    // Matches the import at index 1
                    const match =
                        /\bfrom ['"](.*)['"];?$/.exec(line) ||
                        /\brequire\(['"](.*)['"]\)/.exec(line)
                    return match ? match[1] : undefined
                })
                .filter((x): x is string => Boolean(x))

            const filteredResults = results.filter(result =>
                imports.some(
                    i =>
                        path.join(path.dirname(filePath), i) ===
                        result.file.replace(/\.[^/.]+$/, '')
                )
            )

            return filteredResults.length === 0 ? results : filteredResults
        },
    },
    {
        languageID: 'python',
        stylized: 'Python',
        fileExts: ['py'],
        commentStyle: {
            docPlacement: 'below the definition',
            lineRegex: /#\s?/,
            block: {
                startRegex: /"""/,
                endRegex: /"""/,
            },
        },
        filterDefinitions: ({ filePath, fileContent, results }) => {
            const imports = fileContent
                .split(/\r?\n/)
                .map(line => {
                    // Matches the import at index 1
                    const match =
                        /^import ([\.\w]*)/.exec(line) ||
                        /^from ([\.\w]*)/.exec(line)
                    return match ? match[1] : undefined
                })
                .filter((x): x is string => Boolean(x))

            /**
             * Converts a relative import to a relative path, or undefined
             * if the import is not relative.
             */
            function relativeImportToPath(i: string): string | undefined {
                const match = /^(\.)(\.*)(.*)/.exec(i)
                if (!match) {
                    return undefined
                }
                const parentDots = match[2]
                const pkg = match[3]
                return (
                    parentDots.replace(/\./g, '../') + pkg.replace(/\./g, '/')
                )
            }

            const filteredResults = results.filter(result =>
                imports.some(i =>
                    relativeImportToPath(i)
                        ? path.join(
                              path.dirname(filePath),
                              relativeImportToPath(i) || ''
                          ) === result.file.replace(/\.[^/.]+$/, '')
                        : result.file.includes(i.replace(/\./g, '/'))
                )
            )

            return filteredResults.length === 0 ? results : filteredResults
        },
    },
    {
        languageID: 'java',
        stylized: 'Java',
        fileExts: ['java'],
        docstringIgnore: /^\s*@/,
        commentStyle: cStyle,
        filterDefinitions: ({ fileContent, results }) => {
            const currentFileImports = fileContent
                .split(/\r?\n/)
                .map(line => {
                    // Matches the import at index 1
                    //
                    // - Non-static imports have the form: package.class
                    // - Static imports have the form: package.class+.symbol
                    //
                    // In practice, packages are lowercase and and classes
                    // are uppercase. Take advantage of that to determine
                    // the package in static imports (otherwise it would be
                    // ambiguous).
                    const match =
                        /^import static ([a-z_0-9\.]+)\.[A-Z][\w\.]+;$/.exec(
                            line
                        ) || /^import ([\w\.]+);$/.exec(line)
                    return match ? match[1] : undefined
                })
                .filter((x): x is string => Boolean(x))

            const currentPackage: string | undefined = fileContent
                .split(/\r?\n/)
                .map(line => {
                    // Matches the package name at index 1
                    const match = /^package ([\w\.]+);$/.exec(line)
                    return match ? match[1] : undefined
                })
                .find(x => Boolean(x))

            if (!currentPackage) {
                return results
            }

            // Check if the result's file in any of the imported packages or the current package
            const filteredResults = results.filter(result =>
                [...currentFileImports, currentPackage].some(i =>
                    path
                        .dirname(result.file)
                        .replace(/\//g, '.')
                        .endsWith(i)
                )
            )

            return filteredResults.length === 0 ? results : filteredResults
        },
    },
    {
        languageID: 'go',
        stylized: 'Go',
        fileExts: ['go'],
        filterDefinitions: ({ repo, filePath, pos, fileContent, results }) => {
            const currentFileImportedPaths = fileContent
                .split('\n')
                .map(line => {
                    // Matches the import at index 3
                    const match = /^(import |\t)(\w+ |\. )?"(.*)"$/.exec(line)
                    return match ? match[3] : undefined
                })
                .filter((x): x is string => Boolean(x))

            const currentFileImportPath = repo + '/' + path.dirname(filePath)

            const filteredResults = results.filter(result => {
                const resultImportPath =
                    result.repo + '/' + path.dirname(result.file)
                return (
                    currentFileImportedPaths.some(i =>
                        resultImportPath.includes(i)
                    ) || resultImportPath === currentFileImportPath
                )
            })

            return filteredResults.length === 0 ? results : filteredResults
        },
        commentStyle: {
            lineRegex: /\/\/\s?/,
        },
    },
    {
        languageID: 'cpp',
        stylized: 'C++',
        fileExts: [
            'c',
            'cc',
            'cpp',
            'cxx',
            'hh',
            'h',
            'hpp',
            /* Arduino */ 'ino',
            /* Objective C */ 'm',
        ],
        commentStyle: cStyle,
        filterDefinitions: cppFilterDefinitions,
    },
    {
        languageID: 'cuda',
        stylized: 'CUDA',
        fileExts: ['cu', 'cuh'],
        commentStyle: cStyle,
        filterDefinitions: cppFilterDefinitions,
    },
    {
        languageID: 'ruby',
        stylized: 'Ruby',
        fileExts: [
            'rb',
            'builder',
            'eye',
            'fcgi',
            'gemspec',
            'god',
            'jbuilder',
            'mspec',
            'pluginspec',
            'podspec',
            'rabl',
            'rake',
            'rbuild',
            'rbw',
            'rbx',
            'ru',
            'ruby',
            'spec',
            'thor',
            'watchr',
        ],
        commentStyle: shellStyle,
        identCharPattern: /[A-Za-z0-9_!?]/,
    },
    {
        languageID: 'php',
        stylized: 'PHP',
        fileExts: [
            'php',
            'phtml',
            'php3',
            'php4',
            'php5',
            'php6',
            'php7',
            'phps',
        ],
        commentStyle: cStyle,
    },
    {
        languageID: 'csharp',
        stylized: 'C#',
        fileExts: ['cs', 'csx'],
        commentStyle: { ...cStyle, lineRegex: /\/\/\/?\s?/ },
    },
    {
        languageID: 'shell',
        stylized: 'Shell',
        fileExts: ['sh', 'bash', 'zsh'],
        commentStyle: shellStyle,
    },
    {
        languageID: 'scala',
        stylized: 'Scala',
        docstringIgnore: /^\s*@/,
        fileExts: ['sbt', 'sc', 'scala'],
        commentStyle: cStyle,
    },
    {
        languageID: 'swift',
        stylized: 'Swift',
        fileExts: ['swift'],
        docstringIgnore: /^\s*@/,
        commentStyle: { ...cStyle, lineRegex: /\/\/\/?\s?/ },
    },
    {
        languageID: 'rust',
        stylized: 'Rust',
        fileExts: ['rs', 'rs.in'],
        docstringIgnore: /^#/,
        commentStyle: { ...cStyle, lineRegex: /\/\/\/?!?\s?/ },
    },
    {
        languageID: 'kotlin',
        stylized: 'Kotlin',
        fileExts: ['kt', 'ktm', 'kts'],
        commentStyle: cStyle,
    },
    {
        languageID: 'elixir',
        stylized: 'Elixir',
        fileExts: ['ex', 'exs'],
        docstringIgnore: /^\s*@/,
        commentStyle: {
            ...pythonStyle,
            docPlacement: 'above the definition',
        },
        identCharPattern: /[A-Za-z0-9_!?]/,
    },
    {
        languageID: 'perl',
        stylized: 'Perl',
        fileExts: [
            'pl',
            'al',
            'cgi',
            'fcgi',
            'perl',
            'ph',
            'plx',
            'pm',
            'pod',
            'psgi',
            't',
        ],
        commentStyle: { lineRegex: /#\s?/ },
    },
    {
        languageID: 'lua',
        stylized: 'Lua',
        fileExts: ['lua', 'fcgi', 'nse', 'pd_lua', 'rbxs', 'wlua'],
        commentStyle: {
            lineRegex: /---?\s?/,
            block: {
                startRegex: /--\[\[/,
                endRegex: /\]\]/,
            },
        },
    },
    {
        languageID: 'clojure',
        stylized: 'Clojure',
        fileExts: ['clj', 'cljs', 'cljx'],
        commentStyle: lispStyle,
        identCharPattern: /[A-Za-z0-9_\-!?+*<>=]/,
    },
    {
        languageID: 'haskell',
        stylized: 'Haskell',
        fileExts: ['hs', 'hsc'],
        docstringIgnore: /INLINE|^#/,
        commentStyle: {
            lineRegex: /--\s?\|?\s?/,
            block: {
                startRegex: /{-/,
                endRegex: /-}/,
            },
        },
        identCharPattern: /[A-Za-z0-9_']/,
    },
    {
        languageID: 'powershell',
        stylized: 'PowerShell',
        fileExts: ['ps1', 'psd1', 'psm1'],
        docstringIgnore: /\{/,
        commentStyle: {
            docPlacement: 'below the definition',
            block: {
                startRegex: /<#/,
                endRegex: /#>/,
            },
        },
        identCharPattern: /[A-Za-z0-9_?]/,
    },
    {
        languageID: 'lisp',
        stylized: 'Lisp',
        fileExts: [
            'lisp',
            'asd',
            'cl',
            'lsp',
            'l',
            'ny',
            'podsl',
            'sexp',
            'el',
        ],
        commentStyle: lispStyle,
        identCharPattern: /[A-Za-z0-9_!?]/,
    },
    {
        languageID: 'erlang',
        stylized: 'Erlang',
        fileExts: ['erl'],
        docstringIgnore: /-spec/,
        commentStyle: {
            lineRegex: /%%\s?/,
        },
    },
    {
        languageID: 'dart',
        stylized: 'Dart',
        fileExts: ['dart'],
        commentStyle: { lineRegex: /\/\/\/\s?/ },
    },
    {
        languageID: 'ocaml',
        stylized: 'OCaml',
        fileExts: ['ml', 'eliom', 'eliomi', 'ml4', 'mli', 'mll', 'mly', 're'],
        commentStyle: {
            block: {
                startRegex: /\(\*\*?/,
                lineNoiseRegex: cStyleBlock.lineNoiseRegex,
                endRegex: /\*\)/,
            },
        },
    },
    {
        languageID: 'r',
        stylized: 'R',
        fileExts: ['r', 'R', 'rd', 'rsx'],
        commentStyle: { lineRegex: /#'?\s?/ },
        identCharPattern: /[A-Za-z0-9_\.]/,
    },
    {
        languageID: 'pascal',
        stylized: 'Pascal',
        fileExts: ['p', 'pas', 'pp'],
        commentStyle: {
            // Traditional: (* this is a comment *)
            // Customary:   { this is also a comment }
            block: {
                startRegex: /(\{|\(\*)\s?/,
                endRegex: /(\}|\*\))/,
            },

            // TODO: Some Pascal implementations support //-comments too.
            // Is that common enough to support here?
        },
    },
    {
        languageID: 'verilog',
        stylized: 'Verilog',
        fileExts: ['sv', 'svh', 'svi', 'v'],
        commentStyle: cStyle,
    },
    {
        languageID: 'vhdl',
        stylized: 'VHDL',
        fileExts: ['vhd', 'vhdl'],
        commentStyle: { lineRegex: /--+\s?/ },
    },
    {
        languageID: 'graphql',
        stylized: 'GraphQL',
        fileExts: ['graphql'],
        commentStyle: shellStyle,
    },
    {
        languageID: 'groovy',
        stylized: 'Groovy',
        fileExts: ['groovy'],
        commentStyle: cStyle,
    },
]

export function findLanguageSpec(languageID: string): LanguageSpec {
    const languageSpec = languageSpecs.find(s => s.languageID === languageID)
    if (!languageSpec) {
        throw new Error(`${languageID} is not defined`)
    }
    return languageSpec
}
