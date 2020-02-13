import { LanguageSpec } from './spec'
import {
    cStyle,
    cStyleLineNoiseRegex,
    lispStyle,
    pythonStyle,
    shellStyle,
} from './common'
import { cppSpec, cudaSpec } from './cpp'
import { goSpec } from './go'
import { javaSpec } from './java'
import { pythonSpec } from './python'
import { typescriptSpec } from './typescript'

/**
 * The specification of languages for which search-based code intelligence
 * is supported.
 *
 * The set of languages come from https://madnight.github.io/githut/#/pull_requests/2018/4.
 * The language names come from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers.
 */
export const languageSpecs: LanguageSpec[] = [
    cppSpec,
    cudaSpec,
    goSpec,
    javaSpec,
    pythonSpec,
    typescriptSpec,

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
                lineNoiseRegex: cStyleLineNoiseRegex,
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
        // TODO: Some Pascal implementations support //-comments too.
        // Is that common enough to support here?
        commentStyle: {
            // Traditional: (* this is a comment *)
            // Customary:   { this is also a comment }
            block: {
                startRegex: /(\{|\(\*)\s?/,
                endRegex: /(\}|\*\))/,
            },
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

/**
 * Returns the language spec with teh given language identifier. If no language
 * matches is configured with the given identifier an error is thrown.
 *
 * @param languageID The language ID.
 */
export function findLanguageSpec(languageID: string): LanguageSpec {
    const languageSpec = languageSpecs.find(s => s.languageID === languageID)
    if (languageSpec) {
        return languageSpec
    }

    throw new Error(`${languageID} is not defined`)
}
