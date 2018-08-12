import { createWebWorkerMessageTransports, Worker } from  'cxp/module/jsonrpc2/transports/webWorker'
import { InitializeResult, TextDocumentPositionParams, ReferenceParams } from 'cxp/module/protocol'
import { DidOpenTextDocumentParams } from 'cxp/module/protocol/textDocument'
import { Connection, createConnection } from 'cxp/module/server/server'
import { Location } from 'vscode-languageserver-types'
import { fetchSearchResults, Result } from './api'

declare var self: Worker

const fileContents = new Map<string, string>()
const identCharPattern = /[A-Za-z0-9_]/

function resultToLocation(res: Result): Location {
    return {
        uri: `git://${res.repo}?HEAD#${res.file}`,
        range: {
            start: res.start,
            end: res.end,
        },
    }
}

function register(connection: Connection): void {
    connection.onInitialize(
        params =>
            ({
                capabilities: {
                    definitionProvider: true,
                    referencesProvider: true,
                    textDocumentSync: { openClose: true },
                },
            } as InitializeResult)
    )

    connection.onNotification(
        'textDocument/didOpen',
        (params: DidOpenTextDocumentParams): void => {
            console.log('params', params)
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
            const token = line.substring(start, end)

            const results = await fetchSearchResults(`type:file ${token}`)
            return results.map(resultToLocation)
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
            const token = line.substring(start, end)
            console.log('token', token)

            const results = await fetchSearchResults(`type:file ${token}`)
            return results.map(resultToLocation)
        }
    )
}

const connection = createConnection(createWebWorkerMessageTransports(self))
register(connection)
connection.listen()
