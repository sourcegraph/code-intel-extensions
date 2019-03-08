import * as shell from 'shelljs'
import * as _ from 'lodash'
import * as yargs from 'yargs'
import * as tosource from 'tosource'
import * as fs from 'fs'
import * as spec from '../../languages'

function sourcegraphID(name: string): string {
    const toID = {
        csharp: 'cs',
        shell: 'bash',
    }
    return name in toID ? toID[name] : name
}

const doNotGenerate = ['python', 'typescript', 'go']

function main(): void {
    const args = yargs
        .option('languages', {
            describe: spec.languages
                .map(langSpec => langSpec.handlerArgs.languageID)
                .join(','),
            type: 'string',
        })
        .option('push', { type: 'boolean' })
        .strict().argv
    const languageFilter = !args.languages
        ? () => true
        : (langSpec: spec.LanguageSpec) =>
              args.languages
                  .split(',')
                  .includes(langSpec.handlerArgs.languageID)

    shell.set('-e')

    const depVersion = JSON.parse(shell.cat('template/package.json'))
        .dependencies['@sourcegraph/basic-code-intel']
    const packageVersion = JSON.parse(shell.cat('package/package.json')).version
    if (depVersion !== packageVersion) {
        console.error(
            `You have to update template/package.json's dependency version ${depVersion} so that it matches package/package.json's version ${packageVersion}.`
        )
        process.exit(1)
    }

    shell.rm('-rf', 'temp')
    shell.mkdir('temp')
    console.log(
        'Copying template/node_modules to temp/node_modules (takes ~15s) once up front'
    )
    shell.cp('-R', 'template/node_modules', 'temp/node_modules')
    shell.cd('temp')

    for (const langSpec of spec.languages.filter(languageFilter)) {
        const languageID = langSpec.handlerArgs.languageID
        const stylized = langSpec.stylized
        if (doNotGenerate.includes(languageID)) {
            console.log('Skipping', languageID)
            continue
        }
        console.log('Updating', languageID)

        // Delete everything but node_modules
        shell.exec(
            `find . -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec rm -rf '{}' ';'`
        )
        // Copy from template/ everything but node_modules
        shell.exec(
            `find ../template -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec cp -R '{}' . ';'`
        )

        // The following git gymnastics update the first autogenerated commit in
        // the corresponding repository while preserving all commits after it.

        shell.exec(`git init`)
        shell.exec(
            `git remote add origin git@github.com:sourcegraph/sourcegraph-${languageID}.git`
        )
        shell.exec(`git fetch origin`)

        shell.exec(`git checkout --orphan temp`)

        shell.sed('-i', /\$LANGNAME\b/, languageID, 'package.json')
        shell.sed('-i', /\$LANGID\b/, sourcegraphID(languageID), 'package.json')
        shell.sed('-i', /\$LANG\b/, stylized, 'package.json')
        shell.sed(
            '-i',
            /"name": ".*"/,
            `"name": "${languageID}"`,
            'package.json'
        )
        shell.sed(
            '-i',
            /"\*"/,
            `"onLanguage:${sourcegraphID(languageID)}"`,
            'package.json'
        )
        shell.sed(
            '-i',
            /"title": ".*"/,
            `"title": "${stylized} code intelligence"`,
            'package.json'
        )
        shell.sed(
            '-i',
            /^  "description": ".*"/,
            `"description": "Provides basic code intelligence for ${stylized} using the Sourcegraph search API"`,
            'package.json'
        )
        shell.sed(
            '-i',
            /"url": ".*"/,
            `"url": "https://github.com/sourcegraph/sourcegraph-${languageID}"`,
            'package.json'
        )
        shell.sed(
            '-i',
            /GENERATOR:IMPRECISE_RESULTS_URL/,
            langSpec.hasLanguageServer
                ? `https://github.com/sourcegraph/sourcegraph-${
                      langSpec.handlerArgs.languageID
                  }`
                : `https://github.com/sourcegraph/sourcegraph-${
                      langSpec.handlerArgs.languageID
                  }#limitations`,
            'package.json'
        )
        shell.sed(
            '-i',
            /"These locations are computed using heuristics.*"/,
            langSpec.hasLanguageServer
                ? `These locations are computed using heuristics. Use a language server for precise results."`
                : `These locations are computed using heuristics.`,
            'package.json'
        )
        shell.sed('-i', /\$LANGNAME\b/, languageID, 'README.md')
        shell.sed('-i', /\$LANG\b/, stylized, 'README.md')
        shell.sed(
            '-i',
            /\.\.\/\.\.\/package\/lib/,
            '@sourcegraph/basic-code-intel',
            'src/extension.ts'
        )

        fs.writeFileSync(
            'src/extension.ts',
            `import { activateBasicCodeIntel } from '@sourcegraph/basic-code-intel'

export const activate = activateBasicCodeIntel(${tosource.default(
                langSpec.handlerArgs
            )})
`
        )

        shell.exec(
            'git add .editorconfig .gitignore .prettierignore .prettierrc LICENSE package.json README.md package.json src tsconfig.json yarn.lock'
        )
        shell.exec(
            `git commit -m "Autogenerate the ${languageID} language extension"`
        )
        shell.exec(
            `git rebase --onto temp $(git rev-list --max-parents=0 origin/master) origin/master`
        )
        shell.exec(`git branch -f temp HEAD`)
        shell.exec(`git checkout temp`)
        shell.exec(`yarn --non-interactive`)
        if (args.push) {
            shell.exec(`git push --force origin temp:master`)
            shell.exec(
                'src -config=$HOME/src-config.prod.json extension publish'
            )
        } else {
            console.log('Not pushing', languageID)
        }
    }

    shell.cd('..')
}

main()
