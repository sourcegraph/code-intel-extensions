import {
    TextDocumentPositionParams,
    ReferenceParams,
    InitializeParams,
} from 'cxp/module/protocol'
import { DidOpenTextDocumentParams } from 'cxp/module/protocol/textDocument'
import { API, Result } from './api'
import { Location } from 'vscode-languageserver-types'

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
function resultToLocation(res: Result): Location {
    const rev = res.rev ? res.rev : 'HEAD'
    return {
        uri: `git://${res.repo}?${rev}#${res.file}`,
        range: {
            start: res.start,
            end: res.end,
        },
    }
}

/**
 * Configuration for this extension.
 */
export interface Config {
    /**
     * sourcegraphToken is the access token used to authenticate to the Sourcegraph API. This will be set in the
     * initialize handler.
     */
    sourcegraphToken: string
    definition: {
        symbols: 'no' | 'local' | 'yes'
    }
    debug: {
        traceSearch: boolean
    }
}

/**
 * getAuthToken extracts the Sourcegraph auth token from the merged settings received in
 * initialize params. Throws an error if the token is not present.
 */
function getConfig(params: InitializeParams): Config {
    const p = params as any
    if (!p.configurationCascade || !p.configurationCascade.merged || !p.configurationCascade.merged['basicCodeIntel.sourcegraphToken']) {
        throw new Error('Basic code intelligence extension could not read Sourcegraph auth token from initialize params. Create an auth token and add it to user or site settings: { "cx-basic-code-intel": { "sourcegraphToken": "${AUTH_TOKEN}" } }')
    }
    const c = p.configurationCascade.merged
    return {
        sourcegraphToken: c['basicCodeIntel.sourcegraphToken'],
        definition: {
            symbols: c[''] || 'no',
        },
        debug: {
            traceSearch: c['basicCodeIntel.debug.traceSearch'] || false,
        },
    }
}

export class Handler {
    /**
     * config holds configuration for the CXP server.
     */
    config: Config

    /**
     * api holds a reference to a Sourcegraph API client.
     */
    api: API

    /**
     * fileContents caches file contents from textDocument/didOpen notifications.
     */
    fileContents: Map<string, string>

    constructor(params: InitializeParams) {
        this.config = getConfig(params)
        this.api = new API(
            this.config.debug.traceSearch,
            this.config.sourcegraphToken,
        )
        this.fileContents = new Map<string, string>()
    }

    didOpen(params: DidOpenTextDocumentParams): void {
        this.fileContents.clear()
        this.fileContents.set(params.textDocument.uri, params.textDocument.text)
    }

    async definition(
        params: TextDocumentPositionParams
    ): Promise<Location | Location[] | null> {
        const contents = this.fileContents.get(params.textDocument.uri)
        if (!contents) {
            throw new Error('did not fetch file contents')
        }
        const lines = contents.split('\n')
        const line = lines[params.position.line]
        let end = line.length
        for (let c = params.position.character; c < line.length; c++) {
            if (!identCharPattern.test(line[c])) {
                end = c
                break
            }
        }
        let start = 0
        for (let c = params.position.character; c >= 0; c--) {
            if (!identCharPattern.test(line[c])) {
                start = c + 1
                break
            }
        }
        if (start >= end) {
            return null
        }
        const searchToken = line.substring(start, end)

        const symbolsOp = this.config.definition.symbols
        if (symbolsOp === 'yes' || symbolsOp === 'local') {
            const symbolResults = this.api.search(
                makeQuery(
                    searchToken,
                    true,
                    params.textDocument.uri,
                    symbolsOp === 'local',
                    false
                )
            )
            const textResults = this.api.search(
                makeQuery(
                    searchToken,
                    false,
                    params.textDocument.uri,
                    false,
                    false
                )
            )
            let results = await symbolResults
            if (results.length === 0) {
                results = await textResults
            }
            return results.map(resultToLocation)
        } else {
            return (await this.api.search(
                makeQuery(
                    searchToken,
                    false,
                    params.textDocument.uri,
                    false,
                    false
                )
            )).map(resultToLocation)
        }
    }

    async references(params: ReferenceParams): Promise<Location[] | null> {
        const contents = this.fileContents.get(params.textDocument.uri)
        if (!contents) {
            throw new Error('did not fetch file contents')
        }
        const lines = contents.split('\n')
        const line = lines[params.position.line]
        let end = line.length
        for (let c = params.position.character; c < line.length; c++) {
            if (!identCharPattern.test(line[c])) {
                end = c
                break
            }
        }
        let start = 0
        for (let c = params.position.character; c >= 0; c--) {
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
            makeQuery(searchToken, false, params.textDocument.uri, true, false)
        )
        const nonLocalResultsPromise = this.api.search(
            makeQuery(searchToken, false, params.textDocument.uri, false, true)
        )

        const results: Result[] = []
        return results
            .concat(await localResultsPromise)
            .concat(await nonLocalResultsPromise)
            .map(resultToLocation)
    }
}
