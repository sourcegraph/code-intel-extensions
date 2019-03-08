import { HandlerArgs, CommentStyle } from './package/lib/handler'

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export type LanguageSpec = {
    handlerArgs: Omit<HandlerArgs, 'sourcegraph'>
    stylized: string
    hasLanguageServer?: boolean
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

// The set of languages come from https://madnight.github.io/githut/#/pull_requests/2018/4
// The language names come from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
// The extensions come from shared/src/languages.ts
export const languages: LanguageSpec[] = [
    {
        handlerArgs: {
            languageID: 'typescript',
            fileExts: ['ts', 'tsx', 'js', 'jsx'],
            definitionPatterns: [
                'var\\s\\b%s\\b',
                'let\\s\\b%s\\b',
                'const\\s\\b%s\\b',
                'function\\s\\b%s\\b',
                'interface\\s\\b%s\\b',
                'type\\s\\b%s\\b',
                '\\b%s\\b:',
            ],
            commentStyle: cStyle,
        },
        stylized: 'TypeScript',
        hasLanguageServer: true,
    },
    {
        handlerArgs: {
            languageID: 'python',
            fileExts: ['py'],
            definitionPatterns: ['\\b%s\\b='],
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
        hasLanguageServer: true,
    },
    {
        handlerArgs: {
            languageID: 'java',
            fileExts: ['java'],
            docstringIgnore: /^\s*@/,
            commentStyle: cStyle,
        },
        stylized: 'Java',
    },
    {
        handlerArgs: {
            languageID: 'go',
            fileExts: ['go'],
            definitionPatterns: [
                '\\b%s(,\\s\\w+)*\\s\\:=',
                '(var|const)\\s%s\\s',
            ],
            commentStyle: {
                lineRegex: /\/\/\s?/,
            },
        },
        stylized: 'Go',
        hasLanguageServer: true,
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
            definitionPatterns: ['\\b(def|val|var|class|object|trait)\\s%s\\b'],
            commentStyle: cStyle,
        },
        stylized: 'Scala',
    },
    {
        handlerArgs: {
            languageID: 'swift',
            fileExts: ['swift'],
            definitionPatterns: [
                '\\b(func|class|var|let|for|struct|enum|protocol)\\s%s\\b',
                '\\bfunc\\s.*\\s%s:',
            ],
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
            definitionPatterns: [
                '\\b(fun|val|var|class|interface)\\s%s\\b',
                '\\bfun\\s.*\\s%s:',
                '\\bfor\\s\\(%s\\sin',
            ],
            commentStyle: cStyle,
        },
        stylized: 'Kotlin',
    },
    {
        handlerArgs: {
            languageID: 'elixir',
            fileExts: ['ex', 'exs'],
            docstringIgnore: /^\s*@/,
            definitionPatterns: ['\\b(def|defp|defmodule)\\s%s\\b'],
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
            definitionPatterns: [
                '\\b%s\\s::',
                '^data\\s%s\\b',
                '^newtype\\s%s\\b',
                '^type\\s%s\\b',
                '^class.*\\b%s\\b',
            ],
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
            definitionPatterns: ['^function\\s%s\\b'],
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
            definitionPatterns: ['^(abstract\\s)?class\\s%s\\b'],
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
