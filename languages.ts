import { HandlerArgs, CommentStyle } from './package/lib/handler'

export type LanguageSpec = { handlerArgs: HandlerArgs; stylized: string }

const cStyle: CommentStyle = {
    docPlacement: 'above the definition',
    lineRegex: /\/\/\s*(.*)/,
    block: {
        startRegex: /\/\*\*?/,
        contentRegex: /^\s*\*?\s*(.*)/,
        endRegex: /\*\//,
    },
}

// The set of languages come from https://madnight.github.io/githut/#/pull_requests/2018/4
// The language names come from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
// The extensions come from shared/src/languages.ts
export const languages: { [name: string]: LanguageSpec } = {
    java: {
        handlerArgs: {
            fileExts: ['java'],
            docstringIgnore: /^\s*@/,
            commentStyle: cStyle,
        },
        stylized: 'Java',
    },
    cpp: {
        handlerArgs: {
            fileExts: ['c', 'cc', 'cpp', 'hh', 'h'],
            commentStyle: cStyle,
        },
        stylized: 'C++',
    },
    ruby: {
        handlerArgs: {
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
            commentStyle: { lineRegex: /#\s*(.*)/ },
        },
        stylized: 'Ruby',
    },
    php: {
        handlerArgs: {
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
        },
        stylized: 'PHP',
    },
    csharp: { handlerArgs: { fileExts: ['cs', 'csx'] }, stylized: 'C#' },
    shell: {
        handlerArgs: { fileExts: ['sh', 'bash', 'zsh'] },
        stylized: 'Shell',
    },
    scala: {
        handlerArgs: {
            fileExts: ['sbt', 'sc', 'scala'],
            definitionPatterns: ['\\b(def|val|var|class|object|trait)\\s%s\\b'],
        },
        stylized: 'Scala',
    },
    swift: {
        handlerArgs: {
            fileExts: ['swift'],
            definitionPatterns: [
                '\\b(func|class|var|let|for|struct|enum|protocol)\\s%s\\b',
                '\\bfunc\\s.*\\s%s:',
            ],
        },
        stylized: 'Swift',
    },
    rust: { handlerArgs: { fileExts: ['rs', 'rs.in'] }, stylized: 'Rust' },
    kotlin: {
        handlerArgs: {
            fileExts: ['kt', 'ktm', 'kts'],
            definitionPatterns: [
                '\\b(fun|val|var|class|interface)\\s%s\\b',
                '\\bfun\\s.*\\s%s:',
                '\\bfor\\s\\(%s\\sin',
            ],
        },
        stylized: 'Kotlin',
    },
    elixir: {
        handlerArgs: {
            fileExts: ['ex', 'exs'],
            definitionPatterns: ['\\b(def|defp|defmodule)\\s%s\\b'],
        },
        stylized: 'Elixir',
    },
    perl: {
        handlerArgs: {
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
        },
        stylized: 'Perl',
    },
    lua: {
        handlerArgs: {
            fileExts: ['lua', 'fcgi', 'nse', 'pd_lua', 'rbxs', 'wlua'],
        },
        stylized: 'Lua',
    },
    clojure: {
        handlerArgs: { fileExts: ['clj', 'cljs', 'cljx'] },
        stylized: 'Clojure',
    },
    haskell: {
        handlerArgs: {
            fileExts: ['hs', 'hsc'],
            definitionPatterns: [
                '\\b%s\\s::',
                '^data\\s%s\\b',
                '^newtype\\s%s\\b',
                '^type\\s%s\\b',
                '^class.*\\b%s\\b',
            ],
        },
        stylized: 'Haskell',
    },
    powershell: {
        handlerArgs: { fileExts: ['ps1', 'psd1', 'psm1'] },
        stylized: 'PowerShell',
    },
    lisp: {
        handlerArgs: {
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
        },
        stylized: 'Lisp',
    },
    erlang: { handlerArgs: { fileExts: ['erl'] }, stylized: 'Erlang' },
    dart: { handlerArgs: { fileExts: ['dart'] }, stylized: 'Dart' },
    ocaml: {
        handlerArgs: {
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
        },
        stylized: 'OCaml',
    },
    r: { handlerArgs: { fileExts: ['r', 'rd', 'rsx'] }, stylized: 'R' },
}
