import { HandlerArgs, CommentStyle } from './package/lib/handler'
const path = require('path-browserify')

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export type LanguageSpec = {
    handlerArgs: Omit<HandlerArgs, 'sourcegraph'>
    stylized: string
}

const cStyleBlock = {
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

function dir(path: string) {
    return path.slice(0, path.lastIndexOf('/'))
}

// The set of languages come from https://madnight.github.io/githut/#/pull_requests/2018/4
// The language names come from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
// The extensions come from shared/src/languages.ts
export const languageSpecs: LanguageSpec[] = [
    {
        handlerArgs: {
            languageID: 'typescript',
            fileExts: ['ts', 'tsx', 'js', 'jsx'],
            commentStyle: cStyle,
            filterDefinitions: ({ filePath, fileContent, results }) => {
                const imports = fileContent
                    .split('\n')
                    .map(line => {
                        // Matches the import at index 1
                        const match =
                            /from ['"](.*)['"];?$/.exec(line) ||
                            /require\(['"](.*)['"]\);?$/.exec(line)
                        return match ? match[1] : undefined
                    })
                    .filter((x): x is string => Boolean(x))

                const filteredResults = results.filter(result => {
                    return imports.some(
                        i =>
                            path.join(dir(filePath), i) ===
                            result.file.replace(/\.[^/.]+$/, '')
                    )
                })

                return filteredResults.length === 0 ? results : filteredResults
            },
        },
        stylized: 'TypeScript',
    },
    {
        handlerArgs: {
            languageID: 'python',
            fileExts: ['py'],
            commentStyle: {
                docPlacement: 'below the definition',
                lineRegex: /#\s?/,
                block: {
                    startRegex: /"""/,
                    endRegex: /"""/,
                },
            },
        },
        stylized: 'Python',
    },
    {
        handlerArgs: {
            languageID: 'java',
            fileExts: ['java'],
            docstringIgnore: /^\s*@/,
            commentStyle: cStyle,
            filterDefinitions: ({ fileContent, results }) => {
                const currentFileImports = fileContent
                    .split('\n')
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
                    .split('\n')
                    .map(line => {
                        // Matches the package name at index 1
                        const match = /^package ([\w\.]+);$/.exec(line)
                        return match ? match[1] : undefined
                    })
                    .find(x => Boolean(x))

                if (!currentPackage) {
                    return results
                }

                const filteredResults = results.filter(result => {
                    // Check if the result's file in any of the imported packages or the current package
                    return [...currentFileImports, currentPackage].some(i =>
                        dir(result.file)
                            .replace(/\//g, '.')
                            .endsWith(i)
                    )
                })

                return filteredResults.length === 0 ? results : filteredResults
            },
        },
        stylized: 'Java',
    },
    {
        handlerArgs: {
            languageID: 'go',
            fileExts: ['go'],
            commentStyle: {
                lineRegex: /\/\/\s?/,
            },
            filterDefinitions: ({ repo, filePath, fileContent, results }) => {
                const currentFileImportedPaths = fileContent
                    .split('\n')
                    .map(line => {
                        // Matches the import at index 3
                        const match = /^(import |\t)(\w+ |\. )?"(.*)"$/.exec(
                            line
                        )
                        return match ? match[3] : undefined
                    })
                    .filter((x): x is string => Boolean(x))

                const currentFileImportPath = repo + '/' + dir(filePath)

                const filteredResults = results.filter(result => {
                    const resultImportPath =
                        result.repo + '/' + dir(result.file)
                    return [
                        ...currentFileImportedPaths,
                        currentFileImportPath,
                    ].some(i => resultImportPath === i)
                })

                return filteredResults.length === 0 ? results : filteredResults
            },
        },
        stylized: 'Go',
    },
    {
        handlerArgs: {
            languageID: 'cpp',
            fileExts: ['c', 'cc', 'cpp', 'hh', 'h'],
            commentStyle: cStyle,
        },
        stylized: 'C++',
    },
    {
        handlerArgs: {
            languageID: 'ruby',
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
        },
        stylized: 'Ruby',
    },
    {
        handlerArgs: {
            languageID: 'php',
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
        stylized: 'PHP',
    },
    {
        handlerArgs: {
            languageID: 'csharp',
            fileExts: ['cs', 'csx'],
            commentStyle: { ...cStyle, lineRegex: /\/\/\/?\s?/ },
        },
        stylized: 'C#',
    },
    {
        handlerArgs: {
            languageID: 'shell',
            fileExts: ['sh', 'bash', 'zsh'],
            commentStyle: shellStyle,
        },
        stylized: 'Shell',
    },
    {
        handlerArgs: {
            languageID: 'scala',
            docstringIgnore: /^\s*@/,
            fileExts: ['sbt', 'sc', 'scala'],
            commentStyle: cStyle,
        },
        stylized: 'Scala',
    },
    {
        handlerArgs: {
            languageID: 'swift',
            fileExts: ['swift'],
            docstringIgnore: /^\s*@/,
            commentStyle: { ...cStyle, lineRegex: /\/\/\/?\s?/ },
        },
        stylized: 'Swift',
    },
    {
        handlerArgs: {
            languageID: 'rust',
            fileExts: ['rs', 'rs.in'],
            docstringIgnore: /^#/,
            commentStyle: { ...cStyle, lineRegex: /\/\/\/?!?\s?/ },
        },
        stylized: 'Rust',
    },
    {
        handlerArgs: {
            languageID: 'kotlin',
            fileExts: ['kt', 'ktm', 'kts'],
            commentStyle: cStyle,
        },
        stylized: 'Kotlin',
    },
    {
        handlerArgs: {
            languageID: 'elixir',
            fileExts: ['ex', 'exs'],
            docstringIgnore: /^\s*@/,
            commentStyle: {
                ...pythonStyle,
                docPlacement: 'above the definition',
            },
        },
        stylized: 'Elixir',
    },
    {
        handlerArgs: {
            languageID: 'perl',
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
        stylized: 'Perl',
    },
    {
        handlerArgs: {
            languageID: 'lua',
            fileExts: ['lua', 'fcgi', 'nse', 'pd_lua', 'rbxs', 'wlua'],
            commentStyle: {
                lineRegex: /---?\s?/,
                block: {
                    startRegex: /--\[\[/,
                    endRegex: /\]\]/,
                },
            },
        },
        stylized: 'Lua',
    },
    {
        handlerArgs: {
            languageID: 'clojure',
            fileExts: ['clj', 'cljs', 'cljx'],
            commentStyle: lispStyle,
        },
        stylized: 'Clojure',
    },
    {
        handlerArgs: {
            languageID: 'haskell',
            fileExts: ['hs', 'hsc'],
            docstringIgnore: /INLINE|^#/,
            commentStyle: {
                lineRegex: /--\s?\|?\s?/,
                block: {
                    startRegex: /{-/,
                    endRegex: /-}/,
                },
            },
        },
        stylized: 'Haskell',
    },
    {
        handlerArgs: {
            languageID: 'powershell',
            fileExts: ['ps1', 'psd1', 'psm1'],
            docstringIgnore: /\{/,
            commentStyle: {
                docPlacement: 'below the definition',
                block: {
                    startRegex: /<#/,
                    endRegex: /#>/,
                },
            },
        },
        stylized: 'PowerShell',
    },
    {
        handlerArgs: {
            languageID: 'lisp',
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
        },
        stylized: 'Lisp',
    },
    {
        handlerArgs: {
            languageID: 'erlang',
            fileExts: ['erl'],
            docstringIgnore: /-spec/,
            commentStyle: {
                lineRegex: /%%\s?/,
            },
        },
        stylized: 'Erlang',
    },
    {
        handlerArgs: {
            languageID: 'dart',
            fileExts: ['dart'],
            commentStyle: { lineRegex: /\/\/\/\s?/ },
        },
        stylized: 'Dart',
    },
    {
        handlerArgs: {
            languageID: 'ocaml',
            fileExts: [
                'ml',
                'eliom',
                'eliomi',
                'ml4',
                'mli',
                'mll',
                'mly',
                're',
            ],
            commentStyle: {
                block: {
                    startRegex: /\(\*\*?/,
                    lineNoiseRegex: cStyleBlock.lineNoiseRegex,
                    endRegex: /\*\)/,
                },
            },
        },
        stylized: 'OCaml',
    },
    {
        handlerArgs: {
            languageID: 'r',
            fileExts: ['r', 'R', 'rd', 'rsx'],
            commentStyle: { lineRegex: /#'?\s?/ },
        },
        stylized: 'R',
    },
]
