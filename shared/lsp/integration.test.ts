// Stub Sourcegraph API
import { createStubSourcegraphAPI, createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import mock from 'mock-require'
const stubAPI = createStubSourcegraphAPI()
mock('sourcegraph', stubAPI)

import * as assert from 'assert'
import { Observable, of, Subject } from 'rxjs'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { NoopLogger } from '../logging'
import { NoopProviderWrapper } from '../providers'
import { register } from './registration'

const logger = new NoopLogger()
const providerWrapper = new NoopProviderWrapper()

const stubTransport = (server: Record<string, (parameters: any) => any>) =>
    sinon.spy(() => {
        const closeEvent = new Subject<void>()
        let closed = false
        return {
            sendNotification: sinon.spy(),
            // eslint-disable-next-line @typescript-eslint/require-await
            sendRequest: sinon.spy(async ({ method }: { method: string }, parameters) => {
                if (method in server) {
                    return (server as any)[method](parameters)
                }
                throw new Error(`Unhandled method ${method}`)
            }),
            observeNotification: () => new Observable<never>(),
            setRequestHandler: sinon.spy(),
            closeEvent,
            unsubscribe: sinon.spy(() => {
                closeEvent.next()
                closeEvent.complete()
                closed = true
            }),
            get closed(): boolean {
                return closed
            },
        }
    })

describe('register()', () => {
    it('should initialize one connection for each workspace folder', async () => {
        const sourcegraph = createStubSourcegraphAPI()
        sourcegraph.workspace.roots = [{ uri: new URL('git://repo1?rev') }, { uri: new URL('git://repo2?rev') }]
        const server = {
            initialize: sinon.spy(
                (parameters: lsp.InitializeParams): lsp.InitializeResult => ({
                    capabilities: {},
                })
            ),
        }
        const createConnection = stubTransport(server)
        await register({
            sourcegraph: sourcegraph as any,
            transport: createConnection,
            documentSelector: [{ language: 'foo' }],
            logger,
            providerWrapper,
        })
        sinon.assert.calledTwice(createConnection)
        sinon.assert.calledTwice(server.initialize)
        sinon.assert.calledWith(
            server.initialize,
            sinon.match({
                rootUri: 'git://repo1?rev',
                workspaceFolders: null,
            })
        )
        sinon.assert.calledWith(
            server.initialize,
            sinon.match({
                rootUri: 'git://repo2?rev',
                workspaceFolders: null,
            })
        )
    })
    it('should close a connection when a workspace folder is closed', async () => {
        const sourcegraph = createStubSourcegraphAPI()
        sourcegraph.workspace.roots = [{ uri: new URL('git://repo1?rev') }, { uri: new URL('git://repo2?rev') }]
        const server = {
            initialize: sinon.spy(
                (parameters: lsp.InitializeParams): lsp.InitializeResult => ({
                    capabilities: {},
                })
            ),
        }
        const createConnection = stubTransport(server)
        await register({
            sourcegraph: sourcegraph as any,
            transport: createConnection,
            documentSelector: [{ language: 'foo' }],
            logger,
            providerWrapper,
        })
        const unsubscribed = createConnection.returnValues[0].closeEvent.toPromise()
        sourcegraph.workspace.roots.shift()
        sourcegraph.workspace.rootChanges.next()
        await unsubscribed
        sinon.assert.calledOnce(createConnection.returnValues[0].unsubscribe)
    })
    it('should register a references provider if the server reports the references capability', async () => {
        const repoRoot = new URL('https://sourcegraph.test/repo@rev/-/raw/')
        const server = {
            initialize: sinon.spy(
                (parameters: lsp.InitializeParams): lsp.InitializeResult => ({
                    capabilities: {
                        referencesProvider: true,
                    },
                })
            ),
            'textDocument/references': sinon.spy((parameters: lsp.ReferenceParams): lsp.Location[] => [
                {
                    uri: new URL('bar.ts', repoRoot).href,
                    range: {
                        start: { line: 1, character: 2 },
                        end: { line: 3, character: 4 },
                    },
                },
            ]),
        }
        const createConnection = stubTransport(server)

        stubAPI.workspace.textDocuments = [
            createStubTextDocument({
                uri: new URL('foo.ts', repoRoot).href,
                languageId: 'typescript',
                text: 'console.log("Hello world")',
            }),
        ]
        stubAPI.workspace.roots = [{ uri: repoRoot }]

        const documentSelector = [{ language: 'typescript' }]
        await register({
            sourcegraph: stubAPI as any,
            transport: createConnection,
            documentSelector,
            logger,
            providerWrapper,
            featureOptions: of({
                implementationId: '',
                externalReferencesProvider: undefined,
            }),
        })

        sinon.assert.calledWith(
            server.initialize,
            sinon.match({
                capabilities: {
                    textDocument: {
                        references: {
                            dynamicRegistration: true,
                        },
                    },
                },
            })
        )

        sinon.assert.calledOnce(stubAPI.languages.registerReferenceProvider)

        const [selector, provider] = stubAPI.languages.registerReferenceProvider.args[0]
        assert.deepStrictEqual(selector, [
            {
                language: 'typescript',
                baseUri: new URL('https://sourcegraph.test/repo@rev/-/raw/'),
            },
        ])
        const result = await consume(
            provider.provideReferences(stubAPI.workspace.textDocuments[0], new sourcegraph.Position(0, 2), {
                includeDeclaration: false,
            })
        )
        sinon.assert.calledOnce(server['textDocument/references'])
        sinon.assert.calledWith(server['textDocument/references'], {
            textDocument: { uri: stubAPI.workspace.textDocuments[0].uri },
            position: { line: 0, character: 2 },
            context: { includeDeclaration: false },
        })
        assert.deepStrictEqual(result, [
            {
                uri: new URL('bar.ts', repoRoot),
                range: new stubAPI.Range(new stubAPI.Position(1, 2), new stubAPI.Position(3, 4)),
            },
        ])
    })
    it('should register a definition provider if the server reports the definition capability', async () => {
        const repoRoot = new URL('https://sourcegraph.test/repo@rev/-/raw/')
        const server = {
            initialize: sinon.spy(
                (parameters: lsp.InitializeParams): lsp.InitializeResult => ({
                    capabilities: {
                        definitionProvider: true,
                    },
                })
            ),
            'textDocument/definition': sinon.spy(
                (parameters: lsp.TextDocumentPositionParams): lsp.Definition => ({
                    uri: new URL('bar.ts', repoRoot).href,
                    range: {
                        start: { line: 1, character: 2 },
                        end: { line: 3, character: 4 },
                    },
                })
            ),
        }
        const createConnection = stubTransport(server)

        stubAPI.workspace.textDocuments = [
            createStubTextDocument({
                uri: new URL('foo.ts', repoRoot).href,
                languageId: 'typescript',
                text: 'console.log("Hello world")',
            }),
        ]
        stubAPI.workspace.roots = [{ uri: repoRoot }]

        const documentSelector = [{ language: 'typescript' }]
        await register({
            sourcegraph: stubAPI as any,
            transport: createConnection,
            documentSelector,
            logger,
            providerWrapper,
        })

        sinon.assert.calledWith(
            server.initialize,
            sinon.match({
                capabilities: {
                    textDocument: {
                        definition: {
                            dynamicRegistration: true,
                        },
                    },
                },
            })
        )

        sinon.assert.calledOnce(stubAPI.languages.registerDefinitionProvider)

        const [selector, provider] = stubAPI.languages.registerDefinitionProvider.args[0]
        assert.deepStrictEqual(selector, [
            {
                language: 'typescript',
                baseUri: new URL('https://sourcegraph.test/repo@rev/-/raw/'),
            },
        ])
        const result = await consume(
            provider.provideDefinition(stubAPI.workspace.textDocuments[0], new sourcegraph.Position(0, 2))
        )
        sinon.assert.calledOnce(server['textDocument/definition'])
        sinon.assert.calledWith(server['textDocument/definition'], {
            textDocument: { uri: stubAPI.workspace.textDocuments[0].uri },
            position: { line: 0, character: 2 },
        })
        assert.deepStrictEqual(result, [
            {
                uri: new URL('bar.ts', repoRoot),
                range: new sourcegraph.Range(new sourcegraph.Position(1, 2), new sourcegraph.Position(3, 4)),
            },
        ])
    })
    it('should register a hover provider if the server reports the hover capability', async () => {
        const repoRoot = new URL('https://sourcegraph.test/repo@rev/-/raw/')
        const server = {
            initialize: sinon.spy(
                async (
                    parameters: lsp.InitializeParams
                    // eslint-disable-next-line @typescript-eslint/require-await
                ): Promise<lsp.InitializeResult> => ({
                    capabilities: {
                        hoverProvider: true,
                    },
                })
            ),
            'textDocument/hover': sinon.spy(
                async (
                    parameters: lsp.TextDocumentPositionParams
                    // eslint-disable-next-line @typescript-eslint/require-await
                ): Promise<lsp.Hover> => ({
                    contents: {
                        kind: lsp.MarkupKind.Markdown,
                        value: 'Hello World',
                    },
                })
            ),
        }
        const createConnection = stubTransport(server)

        stubAPI.workspace.textDocuments = [
            createStubTextDocument({
                uri: `${repoRoot.toString()}#foo.ts`,
                languageId: 'typescript',
                text: 'console.log("Hello world")',
            }),
        ]
        stubAPI.workspace.roots = [{ uri: repoRoot }]

        const documentSelector = [{ language: 'typescript' }]
        await register({
            sourcegraph: stubAPI as any,
            transport: createConnection,
            documentSelector,
            logger,
            providerWrapper,
        })

        sinon.assert.calledWith(
            server.initialize,
            sinon.match({
                capabilities: {
                    textDocument: {
                        hover: {
                            contentFormat: ['markdown'],
                            dynamicRegistration: true,
                        },
                    },
                },
            })
        )

        // Assert hover provider was registered
        sinon.assert.calledOnce(stubAPI.languages.registerHoverProvider)

        const [selector, hoverProvider] = stubAPI.languages.registerHoverProvider.args[0]
        assert.deepStrictEqual(selector, [
            {
                language: 'typescript',
                // IF we're in multi-connection mode, the document
                // selector should be scoped to the root URI
                // of the connection that registered the provider
                baseUri: new URL('https://sourcegraph.test/repo@rev/-/raw/'),
            },
        ])
        const result = await consume(
            hoverProvider.provideHover(stubAPI.workspace.textDocuments[0], new sourcegraph.Position(0, 2))
        )
        sinon.assert.calledOnce(server['textDocument/hover'])
        sinon.assert.calledWith(server['textDocument/hover'], {
            textDocument: { uri: stubAPI.workspace.textDocuments[0].uri },
            position: { line: 0, character: 2 },
        })
        assert.deepStrictEqual(result, {
            range: undefined,
            contents: { kind: lsp.MarkupKind.Markdown, value: 'Hello World' },
        })
    })

    it('should register a location provider if the server reports the implementation capability', async () => {
        const repoRoot = new URL('https://sourcegraph.test/repo@rev/-/raw/')
        const server = {
            initialize: sinon.spy(
                (parameters: lsp.InitializeParams): lsp.InitializeResult => ({
                    capabilities: {
                        implementationProvider: true,
                    },
                })
            ),
            'textDocument/implementation': sinon.spy((parameters: lsp.TextDocumentPositionParams): lsp.Location[] => [
                {
                    uri: new URL('bar.ts', repoRoot).href,
                    range: {
                        start: { line: 1, character: 2 },
                        end: { line: 3, character: 4 },
                    },
                },
            ]),
        }
        const createConnection = stubTransport(server)

        stubAPI.workspace.textDocuments = [
            createStubTextDocument({
                uri: new URL('foo.ts', repoRoot).href,
                languageId: 'typescript',
                text: 'console.log("Hello world")',
            }),
        ]
        stubAPI.workspace.roots = [{ uri: repoRoot }]

        const documentSelector = [{ language: 'typescript' }]
        await register({
            sourcegraph: stubAPI as any,
            transport: createConnection,
            documentSelector,
            logger,
            providerWrapper,
            featureOptions: of({
                implementationId: '',
                externalReferencesProvider: undefined,
            }),
        })

        sinon.assert.calledWith(
            server.initialize,
            sinon.match({
                capabilities: {
                    textDocument: {
                        implementation: {
                            dynamicRegistration: true,
                        },
                    },
                },
            })
        )

        sinon.assert.calledOnce(stubAPI.languages.registerLocationProvider)

        const [, selector, provider] = stubAPI.languages.registerLocationProvider.args[0]
        assert.deepStrictEqual(selector, [
            {
                language: 'typescript',
                baseUri: new URL('https://sourcegraph.test/repo@rev/-/raw/'),
            },
        ])
        const result = await consume(
            provider.provideLocations(stubAPI.workspace.textDocuments[0], new sourcegraph.Position(0, 2))
        )
        sinon.assert.calledOnce(server['textDocument/implementation'])
        sinon.assert.calledWith(server['textDocument/implementation'], {
            textDocument: { uri: stubAPI.workspace.textDocuments[0].uri },
            position: { line: 0, character: 2 },
        })
        assert.deepStrictEqual(result, [
            {
                uri: new URL('bar.ts', repoRoot),
                range: new stubAPI.Range(new stubAPI.Position(1, 2), new stubAPI.Position(3, 4)),
            },
        ])
    })
})

async function consume<T>(result: sourcegraph.ProviderResult<T>): Promise<T | null | undefined> {
    const observable = (await result) as sourcegraph.Subscribable<T | null | undefined>
    return new Promise(resolve => {
        const subscription = observable.subscribe(value => {
            resolve(value)
            subscription.unsubscribe()
        })
    })
}
