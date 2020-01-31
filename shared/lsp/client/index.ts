import { differenceBy, identity } from 'lodash'
import * as path from 'path'
import { from, noop, Subscription, Unsubscribable } from 'rxjs'
import { map, scan, startWith } from 'rxjs/operators'
import { DocumentSelector, ProgressReporter, WorkspaceRoot } from 'sourcegraph'
import * as uuid from 'uuid'
import {
    ClientCapabilities,
    Diagnostic,
    DidChangeWorkspaceFoldersNotification,
    DidOpenTextDocumentNotification,
    DidOpenTextDocumentParams,
    DocumentSelector as LSPDocumentSelector,
    InitializeParams,
    InitializeRequest,
    InitializeResult,
    LogMessageNotification,
    MarkupKind,
    PublishDiagnosticsNotification,
    Registration,
    RegistrationRequest,
    ServerCapabilities,
    WorkspaceFolder,
} from 'vscode-languageserver-protocol'
import { LSPConnection } from './connection'
import { features } from './features'
import { Logger, LSP_TO_LOG_LEVEL } from './logging'
import { convertDiagnosticToDecoration, toLSPWorkspaceFolder } from './lsp-conversion'
import { WindowProgressClientCapabilities, WindowProgressNotification } from './protocol.progress.proposed'

export * from './connection'

type SourcegraphAPI = typeof import('sourcegraph')

const registrationId = (staticOptions: any): string =>
    (staticOptions && typeof staticOptions.id === 'string' && staticOptions.id) || uuid.v1()

function staticRegistrationsFromCapabilities(
    capabilities: ServerCapabilities,
    defaultSelector: DocumentSelector
): Registration[] {
    const staticRegistrations: Registration[] = []
    for (const feature of Object.values(features)) {
        if (capabilities[feature.capabilityName]) {
            staticRegistrations.push({
                method: feature.requestType.method,
                id: registrationId(capabilities[feature.capabilityName]),
                registerOptions: feature.capabilityToRegisterOptions(
                    capabilities[feature.capabilityName],
                    defaultSelector as LSPDocumentSelector
                ),
            })
        }
    }
    return staticRegistrations
}

export interface LSPClient extends Unsubscribable {
    /**
     * Ensures a connection with the given workspace root, passes it to the given function.
     * If the workspace is not currently open in Sourcegraph, the connection is closed again after the Promise returned by the function resolved.
     *
     * @param workspaceRoot The client workspace folder root URI that will be ensured to be open before calling the function.
     * @param fn Callback that is called with the connection.
     */
    withConnection<R>(workspaceRoot: URL, fn: (connection: LSPConnection) => Promise<R>): Promise<R>
}

export interface RegisterOptions {
    progressSuffix?: string
    sourcegraph: SourcegraphAPI
    supportsWorkspaceFolders?: boolean
    clientToServerURI?: (uri: URL) => URL
    serverToClientURI?: (uri: URL) => URL
    afterInitialize?: (initializeResult: InitializeResult) => Promise<void> | void
    logger?: Logger
    transport: () => Promise<LSPConnection> | LSPConnection
    documentSelector: DocumentSelector
    initializationOptions?: any
}
export async function register({
    sourcegraph,
    clientToServerURI = identity,
    serverToClientURI = identity,
    logger = console,
    progressSuffix = '',
    supportsWorkspaceFolders,
    afterInitialize = noop,
    transport: createConnection,
    documentSelector,
    initializationOptions,
}: RegisterOptions): Promise<LSPClient> {
    const subscriptions = new Subscription()
    // tslint:disable-next-line:no-object-literal-type-assertion
    const clientCapabilities = {
        textDocument: {
            hover: {
                dynamicRegistration: true,
                contentFormat: [MarkupKind.Markdown],
            },
            definition: {
                dynamicRegistration: true,
            },
            references: {
                dynamicRegistration: true,
            },
        },
        experimental: {
            progress: true,
        },
    } as ClientCapabilities & WindowProgressClientCapabilities

    function syncTextDocuments(connection: LSPConnection): void {
        for (const textDocument of sourcegraph.workspace.textDocuments) {
            const serverTextDocumentUri = clientToServerURI(new URL(textDocument.uri))
            if (!sourcegraph.workspace.roots.some(root => serverTextDocumentUri.href.startsWith(root.uri.toString()))) {
                continue
            }
            const didOpenParams: DidOpenTextDocumentParams = {
                textDocument: {
                    uri: serverTextDocumentUri.href,
                    languageId: textDocument.languageId,
                    text: textDocument.text ?? '', // TODO try to fetch contents from somewhere
                    version: 1,
                },
            }
            connection.sendNotification(DidOpenTextDocumentNotification.type, didOpenParams)
        }
    }

    const registrationSubscriptions = new Map<string, Unsubscribable>()
    /**
     * @param scopeRootUri A client workspace folder root URI to scope the providers to. If `null`, the provider is registered for all workspace folders.
     */
    function registerCapabilities(
        connection: LSPConnection,
        scopeRootUri: URL | null,
        registrations: Registration[]
    ): void {
        for (const registration of registrations) {
            const feature = features[registration.method]
            if (feature) {
                registrationSubscriptions.set(
                    registration.id,
                    feature.register({
                        connection,
                        sourcegraph,
                        scopeRootUri,
                        serverToClientURI,
                        clientToServerURI,
                        registerOptions: registration.registerOptions,
                    })
                )
            }
        }
    }

    async function connect({
        clientRootUri,
        initParams,
        registerProviders,
    }: {
        clientRootUri: URL | null
        initParams: InitializeParams
        registerProviders: boolean
    }): Promise<LSPConnection> {
        const subscriptions = new Subscription()
        const decorationType = sourcegraph.app.createDecorationType()
        const connection = await createConnection()
        logger.log(`WebSocket connection to language server opened`)
        subscriptions.add(
            connection.observeNotification(LogMessageNotification.type).subscribe(({ type, message }) => {
                const method = LSP_TO_LOG_LEVEL[type]
                const args = [
                    new Date().toLocaleTimeString() + ' %cLanguage Server%c %s',
                    'background-color: blue; color: white',
                    '',
                    message,
                ]
                logger[method](...args)
            })
        )

        // Display diagnostics as decorations
        /** Diagnostic by Sourcegraph text document URI */
        const diagnosticsByUri = new Map<string, Diagnostic[]>()
        subscriptions.add(() => {
            // Clear all diagnostics held by this connection
            for (const appWindow of sourcegraph.app.windows) {
                for (const viewComponent of appWindow.visibleViewComponents) {
                    if (diagnosticsByUri.has(viewComponent.document.uri)) {
                        viewComponent.setDecorations(decorationType, [])
                    }
                }
            }
        })

        subscriptions.add(
            connection.observeNotification(PublishDiagnosticsNotification.type).subscribe(params => {
                const uri = new URL(params.uri)
                const sourcegraphTextDocumentUri = serverToClientURI(uri)
                diagnosticsByUri.set(sourcegraphTextDocumentUri.href, params.diagnostics)
                for (const appWindow of sourcegraph.app.windows) {
                    for (const viewComponent of appWindow.visibleViewComponents) {
                        if (viewComponent.document.uri === sourcegraphTextDocumentUri.href) {
                            viewComponent.setDecorations(
                                decorationType,
                                params.diagnostics.map(d => convertDiagnosticToDecoration(sourcegraph, d))
                            )
                        }
                    }
                }
            })
        )

        subscriptions.add(
            sourcegraph.workspace.openedTextDocuments.subscribe(() => {
                for (const appWindow of sourcegraph.app.windows) {
                    for (const viewComponent of appWindow.visibleViewComponents) {
                        const diagnostics = diagnosticsByUri.get(viewComponent.document.uri) ?? []
                        viewComponent.setDecorations(
                            decorationType,
                            diagnostics.map(d => convertDiagnosticToDecoration(sourcegraph, d))
                        )
                    }
                }
            })
        )

        // Show progress reports
        const progressReporters = new Map<string, Promise<ProgressReporter>>()
        subscriptions.add(() => {
            // Cleanup unfinished progress reports
            for (const reporterPromise of progressReporters.values()) {
                // tslint:disable-next-line:no-floating-promises
                reporterPromise.then(reporter => {
                    reporter.complete()
                })
            }
            progressReporters.clear()
        })
        subscriptions.add(
            connection
                .observeNotification(WindowProgressNotification.type)
                .subscribe(async ({ id, title, message, percentage, done }) => {
                    try {
                        if (!sourcegraph.app.activeWindow || !sourcegraph.app.activeWindow.showProgress) {
                            return
                        }
                        let reporterPromise = progressReporters.get(id)
                        if (!reporterPromise) {
                            if (title) {
                                title = title + progressSuffix
                            }
                            reporterPromise = sourcegraph.app.activeWindow.showProgress({ title })
                            progressReporters.set(id, reporterPromise)
                        }
                        const reporter = await reporterPromise
                        reporter.next({ percentage, message })
                        if (done) {
                            reporter.complete()
                            progressReporters.delete(id)
                        }
                    } catch (err) {
                        logger.error('Error handling progress notification', err)
                    }
                })
        )
        await initializeConnection({ connection, clientRootUri, initParams, registerProviders })
        return connection
    }

    async function initializeConnection({
        connection,
        clientRootUri,
        initParams,
        registerProviders,
    }: {
        connection: LSPConnection
        clientRootUri: URL | null
        initParams: InitializeParams
        registerProviders: boolean
    }): Promise<void> {
        const initializeResult = await connection.sendRequest(InitializeRequest.type, initParams)
        // Tell language server about all currently open text documents under this root
        syncTextDocuments(connection)

        if (registerProviders) {
            // Convert static capabilities to dynamic registrations
            const staticRegistrations = staticRegistrationsFromCapabilities(
                initializeResult.capabilities,
                documentSelector
            )

            // Listen for dynamic capabilities
            connection.setRequestHandler(RegistrationRequest.type, params => {
                registerCapabilities(connection, clientRootUri, params.registrations)
            })
            // Register static capabilities
            registerCapabilities(connection, clientRootUri, staticRegistrations)
        }

        await afterInitialize(initializeResult)
    }

    let withConnection: <R>(workspaceFolder: URL, fn: (connection: LSPConnection) => Promise<R>) => Promise<R>

    if (supportsWorkspaceFolders) {
        const connection = await connect({
            clientRootUri: null,
            initParams: {
                processId: null,
                rootUri: null,
                capabilities: clientCapabilities,
                workspaceFolders: sourcegraph.workspace.roots.map(toLSPWorkspaceFolder({ clientToServerURI })),
                initializationOptions,
            },
            registerProviders: true,
        })
        subscriptions.add(connection)
        withConnection = async (workspaceFolder, fn) => {
            let tempWorkspaceFolder: WorkspaceFolder | undefined
            // If workspace folder is not known yet, add it
            if (!sourcegraph.workspace.roots.some(root => root.uri.toString() === workspaceFolder.href)) {
                tempWorkspaceFolder = { uri: workspaceFolder.href, name: path.posix.basename(workspaceFolder.pathname) }
                connection.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
                    event: {
                        added: [tempWorkspaceFolder],
                        removed: [],
                    },
                })
            }
            try {
                return await fn(connection)
            } finally {
                // If workspace folder was added, remove it
                if (tempWorkspaceFolder) {
                    connection.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
                        event: {
                            added: [],
                            removed: [tempWorkspaceFolder],
                        },
                    })
                }
            }
        }

        // Forward root changes
        subscriptions.add(
            from(sourcegraph.workspace.rootChanges)
                .pipe(
                    startWith(null),
                    map(() => [...sourcegraph.workspace.roots]),
                    scan<WorkspaceRoot[], { before: WorkspaceRoot[]; after: WorkspaceRoot[] }>(({ before }, after) => ({
                        before,
                        after,
                    })),
                    map(({ before, after }) => ({
                        added: differenceBy(after, before, root => root.uri.toString()).map(
                            toLSPWorkspaceFolder({ clientToServerURI })
                        ),
                        removed: differenceBy(before, after, root => root.uri.toString()).map(
                            toLSPWorkspaceFolder({ clientToServerURI })
                        ),
                    }))
                )
                .subscribe(event => {
                    connection.sendNotification(DidChangeWorkspaceFoldersNotification.type, { event })
                })
        )
    } else {
        // Supports only one workspace root
        // TODO this should store a refcount to avoid closing connections other consumers have a reference to
        /** Map from client root URI to connection */
        const connectionsByRootUri = new Map<string, Promise<LSPConnection>>()
        withConnection = async (workspaceFolder, fn) => {
            let connection = await connectionsByRootUri.get(workspaceFolder.href)
            if (connection) {
                return await fn(connection)
            }
            const serverRootUri = clientToServerURI(workspaceFolder)
            connection = await connect({
                clientRootUri: workspaceFolder,
                initParams: {
                    processId: null,
                    rootUri: serverRootUri.href,
                    capabilities: clientCapabilities,
                    workspaceFolders: null,
                    initializationOptions,
                },
                registerProviders: false,
            })
            subscriptions.add(connection)
            try {
                return await fn(connection)
            } finally {
                connectionsByRootUri.delete(workspaceFolder.href)
                connection.unsubscribe()
            }
        }
        function addRoots(added: ReadonlyArray<WorkspaceRoot>): void {
            for (const root of added) {
                const connectionPromise = (async () => {
                    try {
                        const serverRootUri = clientToServerURI(new URL(root.uri.toString()))
                        const connection = await connect({
                            clientRootUri: new URL(root.uri.toString()),
                            initParams: {
                                processId: null,
                                rootUri: serverRootUri.href,
                                capabilities: clientCapabilities,
                                workspaceFolders: null,
                                initializationOptions,
                            },
                            registerProviders: true,
                        })
                        subscriptions.add(connection)
                        return connection
                    } catch (err) {
                        logger.error('Error creating connection', err)
                        connectionsByRootUri.delete(root.uri.toString())
                        throw err
                    }
                })()
                connectionsByRootUri.set(root.uri.toString(), connectionPromise)
            }
        }
        subscriptions.add(
            from(sourcegraph.workspace.rootChanges)
                .pipe(
                    startWith(null),
                    map(() => [...sourcegraph.workspace.roots]),
                    scan((before, after) => {
                        // Create new connections for added workspaces
                        const added = differenceBy(after, before, root => root.uri.toString())
                        addRoots(added)

                        // Close connections for removed workspaces
                        const removed = differenceBy(before, after, root => root.uri.toString())
                        // tslint:disable-next-line no-floating-promises
                        Promise.all(
                            removed.map(async root => {
                                try {
                                    const connection = await connectionsByRootUri.get(root.uri.toString())
                                    if (connection) {
                                        connection.unsubscribe()
                                    }
                                } catch (err) {
                                    logger.error('Error disposing connection', err)
                                }
                            })
                        )
                        return after
                    })
                )
                .subscribe()
        )
        addRoots(sourcegraph.workspace.roots)
        await Promise.all(connectionsByRootUri.values())
    }

    return {
        withConnection,
        unsubscribe: () => subscriptions.unsubscribe(),
    }
}
