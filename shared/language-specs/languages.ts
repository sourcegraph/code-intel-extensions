import {
    cStyleComment,
    dashPattern,
    javaStyleComment,
    leadingAtSymbolPattern,
    leadingHashPattern,
    lispStyleComment,
    pythonStyleComment,
    shellStyleComment,
    slashPattern,
    tripleSlashPattern,
} from './comments'
import { cppSpec, cudaSpec } from './cpp'
import { goSpec } from './go'
import { createIdentCharPattern, rubyIdentCharPattern } from './identifiers'
import { javaSpec } from './java'
import { pythonSpec } from './python'
import { LanguageSpec } from './spec'
import { typescriptSpec } from './typescript'

// Please keep the specs below in lexicographic order.

const clojureSpec: LanguageSpec = {
    languageID: 'clojure',
    stylized: 'Clojure',
    fileExts: ['clj', 'cljs', 'cljx'],
    identCharPattern: createIdentCharPattern('\\-!?+*<>='),
    commentStyles: [lispStyleComment],
}

const cobolSpec: LanguageSpec = {
    languageID: 'cobol',
    stylized: 'Cobol',
    fileExts: ['cbl', 'cob', 'cpy', 'dds', 'ss', 'wks', 'pco'],
    identCharPattern: createIdentCharPattern('-'),
    commentStyles: [{ lineRegex: /\*/ }],
}

const csharpSpec: LanguageSpec = {
    languageID: 'csharp',
    stylized: 'C#',
    fileExts: ['cs', 'csx'],
    commentStyles: [cStyleComment],
}

const dartSpec: LanguageSpec = {
    languageID: 'dart',
    stylized: 'Dart',
    fileExts: ['dart'],
    commentStyles: [{ lineRegex: tripleSlashPattern }],
}

const elixirSpec: LanguageSpec = {
    languageID: 'elixir',
    stylized: 'Elixir',
    fileExts: ['ex', 'exs'],
    identCharPattern: rubyIdentCharPattern,
    commentStyles: [
        {
            ...pythonStyleComment,
            docPlacement: 'above the definition',
            docstringIgnore: leadingAtSymbolPattern,
        },
    ],
}

const erlangSpec: LanguageSpec = {
    languageID: 'erlang',
    stylized: 'Erlang',
    fileExts: ['erl'],
    commentStyles: [
        {
            // %% comment
            lineRegex: /%%\s?/,
            // -spec id(X) -> X.
            docstringIgnore: /^\s*-spec/,
        },
    ],
}

const graphqlSpec: LanguageSpec = {
    languageID: 'graphql',
    stylized: 'GraphQL',
    fileExts: ['graphql'],
    commentStyles: [shellStyleComment],
}

const groovySpec: LanguageSpec = {
    languageID: 'groovy',
    stylized: 'Groovy',
    fileExts: ['groovy'],
    commentStyles: [cStyleComment],
}

// {-# PRAGMA args #-}
const haskellPragma = /^\s*{-#\s*[A-Z]+.*#-}$/

const haskellSpec: LanguageSpec = {
    languageID: 'haskell',
    stylized: 'Haskell',
    fileExts: ['hs', 'hsc'],
    identCharPattern: createIdentCharPattern("'"),
    commentStyles: [
        {
            // -- comment
            // -- | doc comment
            // {- block comment -}
            lineRegex: /--\s?\|?\s?/,
            block: { startRegex: /{-/, endRegex: /-}/ },
            docstringIgnore: haskellPragma,
        },
        {
            // -- ^ doc comment
            lineRegex: /--\s?\^?\s?/,
            docPlacement: 'below the definition',
            docstringIgnore: haskellPragma,
        },
    ],
}

const jsonnetSpec: LanguageSpec = {
    languageID: 'jsonnet',
    stylized: 'Jsonnet',
    fileExts: ['jsonnet', 'libsonnet'],
    commentStyles: [cStyleComment],
}

const kotlinSpec: LanguageSpec = {
    languageID: 'kotlin',
    stylized: 'Kotlin',
    fileExts: ['kt', 'ktm', 'kts'],
    commentStyles: [cStyleComment],
}

const lispSpec: LanguageSpec = {
    languageID: 'lisp',
    stylized: 'Lisp',
    fileExts: ['lisp', 'asd', 'cl', 'lsp', 'l', 'ny', 'podsl', 'sexp', 'el'],
    identCharPattern: createIdentCharPattern('\\-!?'),
    commentStyles: [lispStyleComment],
}

const luaSpec: LanguageSpec = {
    languageID: 'lua',
    stylized: 'Lua',
    fileExts: ['lua', 'fcgi', 'nse', 'pd_lua', 'rbxs', 'wlua'],
    commentStyles: [
        {
            // --[[ block comment ]]
            lineRegex: dashPattern,
            block: { startRegex: /--\[\[/, endRegex: /\]\]/ },
        },
    ],
}

const ocamlSpec: LanguageSpec = {
    languageID: 'ocaml',
    stylized: 'OCaml',
    fileExts: ['ml', 'eliom', 'eliomi', 'ml4', 'mli', 'mll', 'mly', 're'],
    commentStyles: [
        {
            // (* block comment *)
            // (** block comment *)
            block: {
                startRegex: /\(\*\*?/,
                endRegex: /\*\)/,
                lineNoiseRegex: /\s*\*\s?/,
            },
        },
    ],
}

const pascalSpec: LanguageSpec = {
    languageID: 'pascal',
    stylized: 'Pascal',
    fileExts: ['p', 'pas', 'pp'],
    commentStyles: [
        {
            // (* block comment *)
            // { turbo pascal block comment }
            lineRegex: slashPattern,
            block: { startRegex: /(\{|\(\*)\s?/, endRegex: /(\}|\*\))/ },
        },
    ],
}

const perlSpec: LanguageSpec = {
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
    commentStyles: [shellStyleComment],
}

const phpSpec: LanguageSpec = {
    languageID: 'php',
    stylized: 'PHP',
    fileExts: ['php', 'phtml', 'php3', 'php4', 'php5', 'php6', 'php7', 'phps'],
    commentStyles: [cStyleComment],
}

const powershellSpec: LanguageSpec = {
    languageID: 'powershell',
    stylized: 'PowerShell',
    fileExts: ['ps1', 'psd1', 'psm1'],
    identCharPattern: createIdentCharPattern('?'),
    commentStyles: [
        {
            // <# doc comment #>
            block: { startRegex: /<#/, endRegex: /#>/ },
            docPlacement: 'below the definition',
            // any line with braces
            docstringIgnore: /\{/,
        },
    ],
}

const protobufSpec: LanguageSpec = {
    languageID: 'protobuf',
    stylized: 'Protocol Buffers',
    fileExts: ['proto'],
    commentStyles: [cStyleComment],
}

const tclSpec: LanguageSpec = {
    languageID: 'tcl',
    stylized: 'Tcl',
    fileExts: ['tcl', 'tk', 'wish', 'itcl'],
    commentStyles: [shellStyleComment],
}

const rSpec: LanguageSpec = {
    languageID: 'r',
    stylized: 'R',
    fileExts: ['r', 'R', 'rd', 'rsx'],
    identCharPattern: createIdentCharPattern('.'),
    // # comment
    // #' comment
    commentStyles: [{ lineRegex: /#'?\s?/ }],
}

const rubySpec: LanguageSpec = {
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
    commentStyles: [shellStyleComment],
    identCharPattern: rubyIdentCharPattern,
}

const rustSpec: LanguageSpec = {
    languageID: 'rust',
    stylized: 'Rust',
    fileExts: ['rs', 'rs.in'],
    commentStyles: [
        {
            ...cStyleComment,
            docstringIgnore: leadingHashPattern,
        },
        {
            lineRegex: /\/\/?!\s?/,
            docstringIgnore: leadingHashPattern,
            docPlacement: 'below the definition',
        },
    ],
}

const scalaSpec: LanguageSpec = {
    languageID: 'scala',
    stylized: 'Scala',
    fileExts: ['sbt', 'sc', 'scala'],
    commentStyles: [javaStyleComment],
}

const shellSpec: LanguageSpec = {
    languageID: 'shell',
    stylized: 'Shell',
    fileExts: ['sh', 'bash', 'zsh'],
    commentStyles: [shellStyleComment],
}

const swiftSpec: LanguageSpec = {
    languageID: 'swift',
    stylized: 'Swift',
    fileExts: ['swift'],
    commentStyles: [javaStyleComment],
}

const thriftSpec: LanguageSpec = {
    languageID: 'thrift',
    stylized: 'Thrift',
    fileExts: ['thrift'],
    commentStyles: [cStyleComment],
}

const verilogSpec: LanguageSpec = {
    languageID: 'verilog',
    stylized: 'Verilog',
    fileExts: ['sv', 'svh', 'svi', 'v'],
    commentStyles: [cStyleComment],
}

const vhdlSpec: LanguageSpec = {
    languageID: 'vhdl',
    stylized: 'VHDL',
    fileExts: ['vhd', 'vhdl'],
    commentStyles: [{ lineRegex: dashPattern }],
}

/**
 * The specification of languages for which search-based code intelligence
 * is supported.
 *
 * The set of languages come from https://madnight.github.io/githut/#/pull_requests/2018/4.
 * The language names come from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers.
 */
export const languageSpecs: LanguageSpec[] = [
    clojureSpec,
    cobolSpec,
    cppSpec,
    csharpSpec,
    cudaSpec,
    dartSpec,
    elixirSpec,
    erlangSpec,
    goSpec,
    graphqlSpec,
    groovySpec,
    haskellSpec,
    javaSpec,
    jsonnetSpec,
    kotlinSpec,
    lispSpec,
    luaSpec,
    ocamlSpec,
    pascalSpec,
    perlSpec,
    phpSpec,
    powershellSpec,
    protobufSpec,
    pythonSpec,
    tclSpec,
    rSpec,
    rubySpec,
    rustSpec,
    scalaSpec,
    shellSpec,
    swiftSpec,
    thriftSpec,
    typescriptSpec,
    verilogSpec,
    vhdlSpec,
]

/**
 * Returns the language spec with the given language identifier. If no language
 * matches is configured with the given identifier an error is thrown.
 */
export function findLanguageSpec(languageID: string): LanguageSpec {
    const languageSpec = languageSpecs.find(s => s.languageID === languageID)
    if (languageSpec) {
        return languageSpec
    }

    throw new Error(`${languageID} is not defined`)
}
