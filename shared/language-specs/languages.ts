import {
    cStyleBlockComment,
    cStyleComment,
    dashPattern,
    hashPattern,
    leadingAsteriskPattern,
    leadingAtSymbolPattern,
    lispStyleComment,
    pythonStyleComment,
    shellStyleComment,
    slashPattern,
    tripleSlashPattern,
} from './comments'
import { LanguageSpec } from './spec'
import { cppSpec, cudaSpec } from './cpp'
import { goSpec } from './go'
import { javaSpec } from './java'
import { pythonSpec } from './python'
import { typescriptSpec } from './typescript'
import { rubyIdentCharPattern, createIdentCharPattern } from './identifiers'

const clojureSpec: LanguageSpec = {
    languageID: 'clojure',
    stylized: 'Clojure',
    fileExts: ['clj', 'cljs', 'cljx'],
    identCharPattern: createIdentCharPattern('-!?+*<>='),
    commentStyle: lispStyleComment,
}

const csharpSpec: LanguageSpec = {
    languageID: 'csharp',
    stylized: 'C#',
    fileExts: ['cs', 'csx'],
    commentStyle: cStyleComment,
}

const dartSpec: LanguageSpec = {
    languageID: 'dart',
    stylized: 'Dart',
    fileExts: ['dart'],
    commentStyle: { lineRegex: tripleSlashPattern },
}

const elixirSpec: LanguageSpec = {
    languageID: 'elixir',
    stylized: 'Elixir',
    fileExts: ['ex', 'exs'],
    identCharPattern: rubyIdentCharPattern,
    commentStyle: {
        ...pythonStyleComment,
        docPlacement: 'above the definition',
    },
    docstringIgnore: leadingAtSymbolPattern,
}

const erlangSpec: LanguageSpec = {
    languageID: 'erlang',
    stylized: 'Erlang',
    fileExts: ['erl'],
    commentStyle: {
        // %% comment
        lineRegex: /%%\s?/,
    },
    docstringIgnore: /-spec/,
}

const graphqlSpec: LanguageSpec = {
    languageID: 'graphql',
    stylized: 'GraphQL',
    fileExts: ['graphql'],
    commentStyle: shellStyleComment,
}

const groovySpec: LanguageSpec = {
    languageID: 'groovy',
    stylized: 'Groovy',
    fileExts: ['groovy'],
    commentStyle: cStyleComment,
}

const haskellSpec: LanguageSpec = {
    languageID: 'haskell',
    stylized: 'Haskell',
    fileExts: ['hs', 'hsc'],
    identCharPattern: createIdentCharPattern("'"),
    commentStyle: {
        // -- comment
        // -- | doc comment
        // {- block comment -}
        // TODO - (support -- ^ doc comment)
        lineRegex: /--\s?\|?\s?/,
        block: { startRegex: /{-/, endRegex: /-}/ },
    },
    docstringIgnore: /INLINE|^#/,
}

const kotlinSpec: LanguageSpec = {
    languageID: 'kotlin',
    stylized: 'Kotlin',
    fileExts: ['kt', 'ktm', 'kts'],
    commentStyle: cStyleComment,
}

const lispSpec: LanguageSpec = {
    languageID: 'lisp',
    stylized: 'Lisp',
    fileExts: ['lisp', 'asd', 'cl', 'lsp', 'l', 'ny', 'podsl', 'sexp', 'el'],
    identCharPattern: createIdentCharPattern('-!?'),
    commentStyle: lispStyleComment,
}

const luaSpec: LanguageSpec = {
    languageID: 'lua',
    stylized: 'Lua',
    fileExts: ['lua', 'fcgi', 'nse', 'pd_lua', 'rbxs', 'wlua'],
    commentStyle: {
        // --[[ block comment ]]
        lineRegex: dashPattern,
        block: { startRegex: /--\[\[/, endRegex: /\]\]/ },
    },
}

const ocamlSpec: LanguageSpec = {
    languageID: 'ocaml',
    stylized: 'OCaml',
    fileExts: ['ml', 'eliom', 'eliomi', 'ml4', 'mli', 'mll', 'mly', 're'],
    commentStyle: {
        // (* block comment *)
        // (** block comment *)
        block: {
            startRegex: /\(\*\*?/,
            endRegex: /\*\)/,
            lineNoiseRegex: leadingAsteriskPattern,
        },
    },
}

const pascalSpec: LanguageSpec = {
    languageID: 'pascal',
    stylized: 'Pascal',
    fileExts: ['p', 'pas', 'pp'],
    commentStyle: {
        // (* block comment *)
        // { turbo pascal block comment }
        lineRegex: slashPattern,
        block: { startRegex: /(\{|\(\*)\s?/, endRegex: /(\}|\*\))/ },
    },
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
    commentStyle: { lineRegex: hashPattern },
}

const phpSpec: LanguageSpec = {
    languageID: 'php',
    stylized: 'PHP',
    fileExts: ['php', 'phtml', 'php3', 'php4', 'php5', 'php6', 'php7', 'phps'],
    commentStyle: cStyleComment,
}

const powershellSpec: LanguageSpec = {
    languageID: 'powershell',
    stylized: 'PowerShell',
    fileExts: ['ps1', 'psd1', 'psm1'],
    identCharPattern: createIdentCharPattern('?'),
    commentStyle: {
        // <# doc comment #>
        block: { startRegex: /<#/, endRegex: /#>/ },
        docPlacement: 'below the definition',
    },
    docstringIgnore: /\{/,
}

const rSpec: LanguageSpec = {
    languageID: 'r',
    stylized: 'R',
    fileExts: ['r', 'R', 'rd', 'rsx'],
    identCharPattern: createIdentCharPattern('.'),
    // # comment
    // #' comment
    commentStyle: { lineRegex: /#'?\s?/ },
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
    commentStyle: shellStyleComment,
    identCharPattern: rubyIdentCharPattern,
}

const rustSpec: LanguageSpec = {
    languageID: 'rust',
    stylized: 'Rust',
    fileExts: ['rs', 'rs.in'],
    commentStyle: {
        // TODO - (support above/below)
        // //! doc comment
        lineRegex: /\/\/\/?!?\s?/,
        block: cStyleBlockComment,
    },
    docstringIgnore: /^#/,
}

const scalaSpec: LanguageSpec = {
    languageID: 'scala',
    stylized: 'Scala',
    fileExts: ['sbt', 'sc', 'scala'],
    commentStyle: cStyleComment,
    docstringIgnore: leadingAtSymbolPattern,
}

const shellSpec: LanguageSpec = {
    languageID: 'shell',
    stylized: 'Shell',
    fileExts: ['sh', 'bash', 'zsh'],
    commentStyle: shellStyleComment,
}

const swiftSpec: LanguageSpec = {
    languageID: 'swift',
    stylized: 'Swift',
    fileExts: ['swift'],
    commentStyle: cStyleComment,
    docstringIgnore: leadingAtSymbolPattern,
}

const verilogSpec: LanguageSpec = {
    languageID: 'verilog',
    stylized: 'Verilog',
    fileExts: ['sv', 'svh', 'svi', 'v'],
    commentStyle: cStyleComment,
}

const vhdlSpec: LanguageSpec = {
    languageID: 'vhdl',
    stylized: 'VHDL',
    fileExts: ['vhd', 'vhdl'],
    commentStyle: { lineRegex: dashPattern },
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
    kotlinSpec,
    lispSpec,
    luaSpec,
    ocamlSpec,
    pascalSpec,
    perlSpec,
    phpSpec,
    powershellSpec,
    pythonSpec,
    rSpec,
    rubySpec,
    rustSpec,
    scalaSpec,
    shellSpec,
    swiftSpec,
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
