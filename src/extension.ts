import { createWebWorkerMessageTransports, Worker } from  'cxp/module/jsonrpc2/transports/webWorker'
import { InitializeResult, TextDocumentPositionParams, ReferenceParams,_InitializeParams, InitializeParams } from 'cxp/module/protocol'
import { DidOpenTextDocumentParams } from 'cxp/module/protocol/textDocument'
import { Connection, createConnection } from 'cxp/module/server/server'
import { Location } from 'vscode-languageserver-types'
import { fetchSearchResults, Result } from './api'
import * as conf from './conf'

declare var self: Worker

/**
 * fileContents caches file contents from textDocument/didOpen notifications
 */
const fileContents = new Map<string, string>()

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
export function makeQuery(searchToken: string, symbols: boolean, currentFileUri: string, local: boolean, nonLocal: boolean): string {
    const terms = [`\\b${searchToken}\\b`, 'case:yes']
    terms.push(fileExtTerm(currentFileUri))
    if (symbols) {
        terms.push('type:symbol')
    } else {
        terms.push('type:file')
    }
    const {repo, version} = parseUri(currentFileUri)
    if (local) {
        terms.push(`repo:^${repo}$@${version}`)
    }
    if (nonLocal) {
        terms.push(`-repo:^${repo}$`)
    }
    return terms.join(' ')
}

function parseUri(uri: string): { repo: string, version: string, path: string } {
    const url = new URL(uri)
    if (url.protocol !== 'git:' || !url.pathname.startsWith('//')) {
        throw new Error('unexpected uri format: ' + uri)
    }
    return {
        repo: url.pathname.substring(2),
        version: url.search.substring(1),
        path: url.hash.substring(1),
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
 * getAuthToken extracts the Sourcegraph auth token from the merged settings received in
 * initialize params. Throws an error if the token is not present.
 */
function getConfig(params: InitializeParams): conf.Config {
    const authTokErr = 'could not read Sourcegraph auth token from initialize params. Did you add an auth token in user settings?'
    let cfg: conf.Config
    try {
        cfg = params.initializationOptions.settings.merged['cx-basic-code-intel']
    } catch(e) {
        throw new Error(authTokErr)
    }

    // Defaults
    if (!cfg.sourcegraphToken) {
        throw new Error(authTokErr)
    }
    if (!cfg.definition || !cfg.definition.symbols) {
        cfg.definition = { symbols: 'no' }
    }
    if (!cfg.debug) {
        cfg.debug = { traceSearch: false }
    }
    return cfg
}

function register(connection: Connection): void {
    connection.onInitialize(
        params => {
            conf.updateConfig(getConfig(params))
            return {
                capabilities: {
                    definitionProvider: true,
                    referencesProvider: true,
                    textDocumentSync: { openClose: true },
                },
            } as InitializeResult
        }
    )

    connection.onNotification(
        'textDocument/didOpen',
        (params: DidOpenTextDocumentParams): void => {
            fileContents.clear()
            fileContents.set(params.textDocument.uri, params.textDocument.text)
        }
    )

    connection.onRequest(
        'textDocument/definition',
        async (params: TextDocumentPositionParams): Promise<Location | Location[] | null> => {
            const contents = fileContents.get(params.textDocument.uri)
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

            const symbolsOp = conf.config.definition.symbols
            if (symbolsOp === 'yes' || symbolsOp === 'local') {
                const symbolResults = fetchSearchResults(conf.config.sourcegraphToken, makeQuery(searchToken, true, params.textDocument.uri, symbolsOp === 'local', false))
                const textResults = fetchSearchResults(conf.config.sourcegraphToken, makeQuery(searchToken, false, params.textDocument.uri, false, false))
                let results = await symbolResults
                if (results.length === 0) {
                    results = await textResults
                }
                return results.map(resultToLocation)
            } else {
                return (await fetchSearchResults(conf.config.sourcegraphToken, makeQuery(searchToken, false, params.textDocument.uri, false, false))).map(resultToLocation)
            }
        }
    )

    connection.onRequest(
        'textDocument/references',
        async (params: ReferenceParams): Promise<Location[] | null> => {
            const contents = fileContents.get(params.textDocument.uri)
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

            const localResultsPromise = fetchSearchResults(conf.config.sourcegraphToken, makeQuery(searchToken, false, params.textDocument.uri, true, false))
            const nonLocalResultsPromise = fetchSearchResults(conf.config.sourcegraphToken, makeQuery(searchToken, false, params.textDocument.uri, false, true))

            const results: Result[] = []
            return results.concat(await localResultsPromise).concat(await nonLocalResultsPromise).map(resultToLocation)
        }
    )
}

const connection = createConnection(createWebWorkerMessageTransports(self))
register(connection)
connection.listen()
