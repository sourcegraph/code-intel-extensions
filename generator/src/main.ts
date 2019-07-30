import * as shell from 'shelljs'
import * as _ from 'lodash'
import * as yargs from 'yargs'
import { languageSpecs, LanguageSpec } from '../../languages'

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
            describe: languageSpecs
                .map(langSpec => langSpec.handlerArgs.languageID)
                .join(','),
            type: 'string',
        })
        .option('publish', { type: 'boolean' })
        .strict().argv
    const languageFilter = !args.languages
        ? () => true
        : (langSpec: LanguageSpec) =>
              args.languages
                  .split(',')
                  .includes(langSpec.handlerArgs.languageID)

    shell.set('-e')

    shell.rm('-rf', '../temp')
    shell.mkdir('../temp')
    console.log(
        'Copying ../template/node_modules to temp/node_modules (takes ~15s) once up front'
    )
    shell.cp('-R', '../template/node_modules', '../temp/node_modules')
    shell.cd('../temp')

    for (const langSpec of languageSpecs.filter(languageFilter)) {
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
        // Copy from ../template/ everything but node_modules
        shell.exec(
            `find ../template -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec cp -R '{}' . ';'`
        )

        shell.sed('-i', /LANGNAME\b/g, languageID, 'package.json')
        shell.sed('-i', /LANGID\b/g, sourcegraphID(languageID), 'package.json')
        shell.sed('-i', /LANG\b/g, stylized, 'package.json')
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
            /"Results come from text search and heuristics.*"/,
            `"Results come from text search and heuristics."`,
            'package.json'
        )
        shell.sed('-i', /LANGNAME\b/g, languageID, 'README.md')
        shell.sed('-i', /LANG\b/g, stylized, 'README.md')

        shell.sed(
            '-i',
            /const languageID = 'all'/,
            `const languageID = '${languageID}'`,
            'src/extension.ts'
        )

        shell.exec(`yarn --non-interactive`)
        if (args.publish) {
            shell.exec(
                'src -config=$HOME/src-config.prod.json extension publish'
            )
        } else {
            console.log('Not publishing', languageID)
        }
    }

    shell.cd('..')
}

main()
