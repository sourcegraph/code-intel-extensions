import * as shell from 'shelljs'
import * as _ from 'lodash'
import * as yargs from 'yargs'
import { HandlerArgs } from '../../package/lib/handler'

type LanguageSpec = HandlerArgs & { stylized: string }

// The set of languages come from https://madnight.github.io/githut/#/pull_requests/2018/4
// The language names come from https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
// The extensions come from shared/src/languages.ts
const languages: { [name: string]: LanguageSpec } = {
    java: { fileExts: ['java'], stylized: 'Java' },
    cpp: { fileExts: ['c', 'cc', 'cpp', 'hh', 'h'], stylized: 'C++' },
    ruby: {
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
        stylized: 'Ruby',
    },
    php: {
        fileExts: ['php', 'phtml', 'php3', 'php4', 'php5', 'php6', 'php7', 'phps'],
        stylized: 'PHP',
    },
    csharp: { fileExts: ['cs', 'csx'], stylized: 'C#' },
    shell: { fileExts: ['sh', 'bash', 'zsh'], stylized: 'Shell' },
    scala: {
        fileExts: ['sbt', 'sc', 'scala'],
        stylized: 'Scala',
        definitionPatterns: ['\\b(def|val|var|class|object|trait)\\s%s\\b'],
    },
    swift: {
        fileExts: ['swift'],
        stylized: 'Swift',
        definitionPatterns: ['\\b(func|class|var|let|for|struct|enum|protocol)\\s%s\\b', '\\bfunc\\s.*\\s%s:'],
    },
    rust: { fileExts: ['rs', 'rs.in'], stylized: 'Rust' },
    kotlin: {
        fileExts: ['kt', 'ktm', 'kts'],
        stylized: 'Kotlin',
        definitionPatterns: ['\\b(fun|val|var|class|interface)\\s%s\\b', '\\bfun\\s.*\\s%s:', '\\bfor\\s\\(%s\\sin'],
    },
    elixir: { fileExts: ['ex', 'exs'], stylized: 'Elixir', definitionPatterns: ['\\b(def|defp|defmodule)\\s%s\\b'] },
    perl: {
        fileExts: ['pl', 'al', 'cgi', 'fcgi', 'perl', 'ph', 'plx', 'pm', 'pod', 'psgi', 't'],
        stylized: 'Perl',
    },
    lua: { fileExts: ['lua', 'fcgi', 'nse', 'pd_lua', 'rbxs', 'wlua'], stylized: 'Lua' },
    clojure: { fileExts: ['clj', 'cljs', 'cljx'], stylized: 'Clojure' },
    haskell: {
        fileExts: ['hs', 'hsc'],
        stylized: 'Haskell',
        definitionPatterns: ['\\b%s\\s::', '^data\\s%s\\b', '^newtype\\s%s\\b', '^type\\s%s\\b', '^class.*\\b%s\\b'],
    },
    powershell: { fileExts: ['ps1', 'psd1', 'psm1'], stylized: 'PowerShell' },
    lisp: {
        fileExts: ['lisp', 'asd', 'cl', 'lsp', 'l', 'ny', 'podsl', 'sexp', 'el'],
        stylized: 'Lisp',
    },
    erlang: { fileExts: ['erl'], stylized: 'Erlang' },
    dart: { fileExts: ['dart'], stylized: 'Dart' },
    ocaml: {
        fileExts: ['ml', 'eliom', 'eliomi', 'ml4', 'mli', 'mll', 'mly', 're'],
        stylized: 'OCaml',
    },
    r: { fileExts: ['r', 'rd', 'rsx'], stylized: 'R' },
}

function langID(name: string): string {
    const toID = {
        csharp: 'cs',
    }
    return name in toID ? toID[name] : name
}

function quote(value: string): string {
    return `'${value.replace(/\\/g, '\\\\')}'`
}

function jsStringify(values: string[]): string {
    return `[${values.map(quote).join(', ')}]`
}

function main(): void {
    const args = yargs
        .option('languages', {
            describe: _.keys(languages).join(','),
            type: 'string',
        })
        .option('push', { type: 'boolean' }).argv
    const languageFilter = !args.languages
        ? () => true
        : (_: any, key: string) => args.languages.split(',').includes(key)

    shell.set('-e')

    const depVersion = JSON.parse(shell.cat('template/package.json')).dependencies['@sourcegraph/basic-code-intel']
    const packageVersion = JSON.parse(shell.cat('package/package.json')).version
    if (depVersion !== packageVersion) {
        console.error(
            `You have to update template/package.json's dependency version ${depVersion} so that it matches package/package.json's version ${packageVersion}.`
        )
        process.exit(1)
    }

    shell.rm('-rf', 'temp')
    shell.mkdir('temp')
    console.log('Copying template/node_modules to temp/node_modules (takes ~15s) once up front')
    shell.cp('-R', 'template/node_modules', 'temp/node_modules')
    shell.cd('temp')

    _.forEach(
        _.pickBy(languages, languageFilter),
        ({ fileExts, stylized, definitionPatterns = [] }: LanguageSpec, name) => {
            console.log('Updating', name)

            // Delete everything but node_modules
            shell.exec(`find . -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec rm -rf '{}' ';'`)
            // Copy from template/ everything but node_modules
            shell.exec(`find ../template -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec cp -R '{}' . ';'`)

            // The following git gymnastics update the first autogenerated commit in
            // the corresponding repository while preserving all commits after it.

            shell.exec(`git init`)
            shell.exec(`git remote add origin git@github.com:sourcegraph/sourcegraph-${name}.git`)
            shell.exec(`git fetch origin`)

            shell.exec(`git checkout --orphan temp`)

            shell.sed('-i', /\$LANGNAME\b/, name, 'package.json')
            shell.sed('-i', /\$LANGID\b/, langID(name), 'package.json')
            shell.sed('-i', /\$LANG\b/, stylized, 'package.json')
            shell.sed('-i', /"name": ".*"/, `"name": "${name}"`, 'package.json')
            shell.sed('-i', /"onLanguage:.*"/, `"onLanguage:${langID(name)}"`, 'package.json')
            shell.sed('-i', /"title": ".*"/, `"title": "${stylized} code intelligence"`, 'package.json')
            shell.sed(
                '-i',
                /"description": ".*"/,
                `"description": "Provides basic code intelligence for ${stylized} using the Sourcegraph search API"`,
                'package.json'
            )
            shell.sed(
                '-i',
                /"url": ".*"/,
                `"url": "https://github.com/sourcegraph/sourcegraph-${name}"`,
                'package.json'
            )
            shell.sed('-i', /\$LANGNAME\b/, name, 'README.md')
            shell.sed('-i', /\$LANG\b/, stylized, 'README.md')
            shell.sed('-i', /\.\.\/\.\.\/package\/lib/, '@sourcegraph/basic-code-intel', 'src/extension.ts')

            shell.set('+e')
            if (shell.exec('grep "fileExts: \\[\\]" src/extension.ts').code !== 0) {
                console.log('Dirty `fileExts: []` in src/extensions.ts')
            }
            shell.set('-e')
            shell.sed('-i', /fileExts: \[\]/, `fileExts: ${jsStringify(fileExts)}`, 'src/extension.ts')

            shell.set('+e')
            if (shell.exec('grep "definitionPatterns: \\[\\]" src/extension.ts').code !== 0) {
                console.log('Dirty `definitionPatterns: []` in src/extensions.ts')
            }
            shell.set('-e')

            shell.sed(
                '-i',
                /definitionPatterns: \[\]/,
                `definitionPatterns: ${jsStringify(definitionPatterns)}`,
                'src/extension.ts'
            )

            shell.exec(
                'git add .editorconfig .gitignore .prettierignore .prettierrc LICENSE package.json README.md package.json src tsconfig.json yarn.lock'
            )
            shell.exec(`git commit -m "Autogenerate the ${name} language extension"`)
            shell.exec(`git rebase --onto temp $(git rev-list --max-parents=0 origin/master) origin/master`)
            shell.exec(`git branch -f temp HEAD`)
            shell.exec(`git checkout temp`)
            if (args.push) {
                shell.exec(`git push --force origin temp:master`)
                shell.exec('src -config=$HOME/src-config.prod.json extension publish')
            } else {
                console.log('Not pushing', name)
            }
        }
    )

    shell.cd('..')
}

main()
