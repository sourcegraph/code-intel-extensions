import * as sourcegraph from 'sourcegraph'
import { API, Result } from './api'

/**
 * identCharPattern is used to match identifier tokens
 */
const identCharPattern = /[A-Za-z0-9_]/

/**
 * fileExtSets describe file extension sets that may contain references to one another.
 * The elements of this array *must* be disjoint sets. Don't refer to this variable directly.
 * Instead, call fileExtTerm.
 */
const fileExtsSets = [
    ['h', 'c', 'hpp', 'cpp', 'm', 'cc'],
    ['java'],
    ['go'],
    ['js'],
    ['ts'],
    ['rb', 'erb'],
    ['py'],
    ['php'],
    ['css'],
    ['cs'],
    ['sh'],
    ['scala'],
    ['erl'],
    ['r'],
    ['swift'],
    ['coffee'],
    ['pl'],
]
const fileExtToTerm = new Map<string, string>()
function initFileExtToTerm() {
    for (const s of fileExtsSets) {
        const extRegExp = `file:\.(${s.join('|')})$`
        for (const e of s) {
            fileExtToTerm.set(e, extRegExp)
        }
    }
}
initFileExtToTerm()

/**
 * fileExtTerm returns the search term to use to filter to specific file extensions
 */
function fileExtTerm(sourceFile: string): string {
    const i = sourceFile.lastIndexOf('.')
    if (i === -1) {
        return ''
    }
    const ext = sourceFile.substring(i + 1).toLowerCase()
    const match = fileExtToTerm.get(ext)
    if (match) {
        return match
    }
    return ''
}

/**
 * makeQuery returns the search query to use for a given set of options.
 */
function makeQuery(
    searchToken: string,
    symbols: boolean,
    currentFileUri: string,
    local: boolean,
    nonLocal: boolean
): string {
    const terms = [`\\b${searchToken}\\b`, 'case:yes']
    terms.push(fileExtTerm(currentFileUri))
    if (symbols) {
        terms.push('type:symbol')
    } else {
        terms.push('type:file')
    }
    const { repo, version } = parseUri(currentFileUri)
    if (local) {
        terms.push(`repo:^${repo}$@${version}`)
    }
    if (nonLocal) {
        terms.push(`-repo:^${repo}$`)
    }
    return terms.join(' ')
}

function parseUri(
    uri: string
): { repo: string; version: string; path: string } {
    if (!uri.startsWith('git://')) {
        throw new Error('unexpected uri format: ' + uri)
    }
    const repoRevPath = uri.substr('git://'.length)
    const i = repoRevPath.indexOf('?')
    if (i < 0) {
        throw new Error('unexpected uri format: ' + uri)
    }
    const revPath = repoRevPath.substr(i + 1)
    const j = revPath.indexOf('#')
    if (j < 0) {
        throw new Error('unexpected uri format: ' + uri)
    }
    const path = revPath.substr(j + 1)
    return {
        repo: repoRevPath.substring(0, i),
        version: revPath.substring(0, j),
        path: path,
    }
}

/**
 * resultToLocation maps a search result to a LSP Location instance.
 */
function resultToLocation(res: Result): sourcegraph.Location {
    const rev = res.rev ? res.rev : 'HEAD'
    return {
        uri: new sourcegraph.URI(`git://${res.repo}?${rev}#${res.file}`),
        range: new sourcegraph.Range(
            res.start.line,
            res.start.character,
            res.end.line,
            res.end.character
        ),
    }
}

/**
 * @see package.json contributes.configuration section for the configuration schema.
 */
export interface Config {
    ['basicCodeIntel.enabled']?: boolean
    ['basicCodeIntel.sourcegraphToken']?: string
    ['basicCodeIntel.definition.symbols']?: 'local' | 'always'
    ['basicCodeIntel.debug.traceSearch']?: boolean
}

export class Handler {
    /**
     * api holds a reference to a Sourcegraph API client.
     */
    public api = new API()

    private get enabled(): boolean {
        return Boolean(
            sourcegraph.configuration
                .get<Config>()
                .get('basicCodeIntel.enabled')
        )
    }

    async definition(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        symbols = sourcegraph.configuration
            .get<Config>()
            .get('basicCodeIntel.definition.symbols')
    ): Promise<sourcegraph.Location | sourcegraph.Location[] | null> {
        if (!this.enabled) {
            return null
        }

        const lines = doc.text.split('\n')
        const line = lines[pos.line]
        let end = line.length
        for (let c = pos.character; c < line.length; c++) {
            if (!identCharPattern.test(line[c])) {
                end = c
                break
            }
        }
        let start = 0
        for (let c = pos.character; c >= 0; c--) {
            if (!identCharPattern.test(line[c])) {
                start = c + 1
                break
            }
        }
        if (start >= end) {
            return null
        }
        const searchToken = line.substring(start, end)

        if (symbols === 'always' || symbols === 'local') {
            const symbolResults = this.api.search(
                makeQuery(
                    searchToken,
                    true,
                    doc.uri,
                    symbols === 'local',
                    false
                )
            )
            const textResults = this.api.search(
                makeQuery(searchToken, false, doc.uri, false, false)
            )
            let results = await symbolResults
            if (results.length === 0) {
                results = await textResults
            }
            return results.map(resultToLocation)
        } else {
            return (await this.api.search(
                makeQuery(searchToken, false, doc.uri, false, false)
            )).map(resultToLocation)
        }
    }

    async references(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<sourcegraph.Location[] | null> {
        if (!this.enabled) {
            return null
        }

        const lines = doc.text.split('\n')
        const line = lines[pos.line]
        let end = line.length
        for (let c = pos.character; c < line.length; c++) {
            if (!identCharPattern.test(line[c])) {
                end = c
                break
            }
        }
        let start = 0
        for (let c = pos.character; c >= 0; c--) {
            if (!identCharPattern.test(line[c])) {
                start = c + 1
                break
            }
        }
        if (start >= end) {
            return null
        }
        const searchToken = line.substring(start, end)

        const localResultsPromise = this.api.search(
            makeQuery(searchToken, false, doc.uri, true, false)
        )
        const nonLocalResultsPromise = this.api.search(
            makeQuery(searchToken, false, doc.uri, false, true)
        )

        const results: Result[] = []
        return results
            .concat(await localResultsPromise)
            .concat(await nonLocalResultsPromise)
            .map(resultToLocation)
    }
}
