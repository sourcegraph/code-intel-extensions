import { differenceBy, identity } from 'lodash'
import { EMPTY, from, Observable, Subscription } from 'rxjs'
import { map, scan, startWith } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import * as uuid from 'uuid'
import * as lsp from 'vscode-languageserver-protocol'
import { Logger, LogLevel, RedactingLogger } from '../logging'
import { ProviderWrapper } from '../providers'
import { LSPClient } from './client'
import { LSPConnection } from './connection'
import { convertDiagnosticToDecoration } from './conversion'
import {
    definitionFeature,
    DefinitionFeatureOptions,
} from './features/definition'
import { hoverFeature, HoverFeatureOptions } from './features/hover'
import {
    implementationFeature,
    ImplementationFeatureOptions,
} from './features/implementation'
import {
    referencesFeature,
    ReferencesFeatureOptions,
} from './features/references'
import {
    WindowProgressClientCapabilities,
    WindowProgressNotification,
} from './protocol.progress.proposed'

export const LSP_TO_LOG_LEVEL: Record<lsp.MessageType, LogLevel> = {
    [lsp.MessageType.Log]: 'log',
    [lsp.MessageType.Info]: 'info',
    [lsp.MessageType.Warning]: 'warn',
    [lsp.MessageType.Error]: 'error',
}

export type FeatureOptions = DefinitionFeatureOptions &
    ReferencesFeatureOptions &
    HoverFeatureOptions &
    ImplementationFeatureOptions

const features = {
    [definitionFeature.requestType.method]: definitionFeature,
    [referencesFeature.requestType.method]: referencesFeature,
    [hoverFeature.requestType.method]: hoverFeature,
    [implementationFeature.requestType.method]: implementationFeature,
}

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const clientCapabilities = {
    textDocument: {
        hover: {
            dynamicRegistration: true,
            contentFormat: [lsp.MarkupKind.Markdown],
        },
        definition: {
            dynamicRegistration: true,
        },
        references: {
            dynamicRegistration: true,
        },
        implementation: {
            dynamicRegistration: true,
        },
    },
    experimental: {
        progress: true,
    },
} as lsp.ClientCapabilities & WindowProgressClientCapabilities

export interface RegisterOptions {
    progressSuffix?: string
    sourcegraph: typeof sourcegraph
    clientToServerURI?: (uri: URL) => URL
    serverToClientURI?: (uri: URL) => URL
    logger?: Logger
    transport: () => Promise<LSPConnection> | LSPConnection
    documentSelector: sourcegraph.DocumentSelector
    initializationOptions?: unknown
    providerWrapper: ProviderWrapper
    featureOptions?: Observable<FeatureOptions>
    cancellationToken?: lsp.CancellationToken
}

export async function register({
    sourcegraph,
    clientToServerURI = identity,
    serverToClientURI = identity,
    logger = new RedactingLogger(console),
    progressSuffix = '',
    transport: createConnection,
    documentSelector,
    initializationOptions,
    providerWrapper,
    featureOptions,
    cancellationToken,
}: RegisterOptions): Promise<LSPClient> {
    const subscriptions = new Subscription()

    if (cancellationToken) {
        cancellationToken.onCancellationRequested(() =>
            subscriptions.unsubscribe()
        )
    }

    function syncTextDocuments(connection: LSPConnection): void {
        for (const textDocument of sourcegraph.workspace.textDocuments) {
            const serverTextDocumentUri = clientToServerURI(
                new URL(textDocument.uri)
            )
            if (
                !sourcegraph.workspace.roots.some(root =>
                    serverTextDocumentUri.href.startsWith(root.uri.toString())
                )
            ) {
                continue
            }
            const didOpenParams: lsp.DidOpenTextDocumentParams = {
                textDocument: {
                    uri: serverTextDocumentUri.href,
                    languageId: textDocument.languageId,
                    text: textDocument.text ?? '', // TODO try to fetch contents from somewhere
                    version: 1,
                },
            }
            connection.sendNotification(
                lsp.DidOpenTextDocumentNotification.type,
                didOpenParams
            )
        }
    }

    /**
     * @param scopeRootUri A client workspace folder root URI to scope the providers to. If `null`, the provider is registered for all workspace folders.
     */
    function registerCapabilities(
        connection: LSPConnection,
        scopeRootUri: URL | null,
        registrations: lsp.Registration[]
    ): void {
        for (const registration of registrations) {
            const feature = features[registration.method]
            if (!feature) {
                continue
            }

            const featureSubscription = feature.register({
                connection,
                sourcegraph,
                serverToClientURI,
                clientToServerURI,
                scopedDocumentSelector: scopeDocumentSelectorToRoot(
                    documentSelector,
                    scopeRootUri
                ),
                providerWrapper,
                featureOptions: featureOptions || EMPTY,
            })

            subscriptions.add(
                connection.closeEvent.subscribe(() =>
                    featureSubscription.unsubscribe()
                )
            )
        }
    }

    async function connect({
        clientRootUri,
        initParams,
        registerProviders,
    }: {
        clientRootUri: URL | null
        initParams: lsp.InitializeParams
        registerProviders: boolean
    }): Promise<LSPConnection> {
        const subscriptions = new Subscription()
        const decorationType = sourcegraph.app.createDecorationType()
        const connection = await createConnection()
        logger.log('WebSocket connection to language server opened')
        subscriptions.add(
            connection
                .observeNotification(lsp.LogMessageNotification.type)
                .subscribe(({ type, message }) => {
                    const method = LSP_TO_LOG_LEVEL[type]
                    const args = [
                        new Date().toLocaleTimeString() +
                            ' %cLanguage Server%c %s',
                        'background-color: blue; color: white',
                        '',
                        message,
                    ]
                    logger[method](...args)
                })
        )

        // Display diagnostics as decorations
        /** Diagnostic by Sourcegraph text document URI */
        const diagnosticsByUri = new Map<string, lsp.Diagnostic[]>()
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
            connection
                .observeNotification(lsp.PublishDiagnosticsNotification.type)
                .subscribe(params => {
                    const uri = new URL(params.uri)
                    const sourcegraphTextDocumentUri = serverToClientURI(uri)
                    diagnosticsByUri.set(
                        sourcegraphTextDocumentUri.href,
                        params.diagnostics
                    )
                    for (const appWindow of sourcegraph.app.windows) {
                        for (const viewComponent of appWindow.visibleViewComponents) {
                            if (
                                viewComponent.document.uri ===
                                sourcegraphTextDocumentUri.href
                            ) {
                                viewComponent.setDecorations(
                                    decorationType,
                                    params.diagnostics.map(d =>
                                        convertDiagnosticToDecoration(d)
                                    )
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
                        const diagnostics =
                            diagnosticsByUri.get(viewComponent.document.uri) ??
                            []
                        viewComponent.setDecorations(
                            decorationType,
                            diagnostics.map(d =>
                                convertDiagnosticToDecoration(d)
                            )
                        )
                    }
                }
            })
        )

        // Show progress reports
        const progressReporters = new Map<
            string,
            Promise<sourcegraph.ProgressReporter>
        >()
        subscriptions.add(() => {
            // Cleanup unfinished progress reports
            for (const reporterPromise of progressReporters.values()) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                reporterPromise.then(reporter => {
                    reporter.complete()
                })
            }
            progressReporters.clear()
        })
        subscriptions.add(
            connection
                .observeNotification(WindowProgressNotification.type)
                // Exceptions are handled in try/catch
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                .subscribe(async ({ id, title, message, percentage, done }) => {
                    try {
                        if (
                            typeof sourcegraph.app.activeWindow
                                ?.showProgress !== 'function'
                        ) {
                            return
                        }
                        let reporterPromise = progressReporters.get(id)
                        if (!reporterPromise) {
                            if (title) {
                                title = title + progressSuffix
                            }
                            reporterPromise = sourcegraph.app.activeWindow.showProgress(
                                { title }
                            )
                            progressReporters.set(id, reporterPromise)
                        }
                        const reporter = await reporterPromise
                        reporter.next({ percentage, message })
                        if (done) {
                            reporter.complete()
                            progressReporters.delete(id)
                        }
                    } catch (err) {
                        logger.error(
                            'Error handling progress notification',
                            err
                        )
                    }
                })
        )
        await initializeConnection({
            connection,
            clientRootUri,
            initParams,
            registerProviders,
        })
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
        initParams: lsp.InitializeParams
        registerProviders: boolean
    }): Promise<void> {
        const initializeResult = await connection.sendRequest(
            lsp.InitializeRequest.type,
            initParams
        )
        // Tell language server about all currently open text documents under this root
        syncTextDocuments(connection)

        if (registerProviders) {
            // Convert static capabilities to dynamic registrations
            const staticRegistrations = staticRegistrationsFromCapabilities(
                initializeResult.capabilities,
                documentSelector
            )

            // Listen for dynamic capabilities
            connection.setRequestHandler(
                lsp.RegistrationRequest.type,
                params => {
                    registerCapabilities(
                        connection,
                        clientRootUri,
                        params.registrations
                    )
                }
            )
            // Register static capabilities
            registerCapabilities(connection, clientRootUri, staticRegistrations)
        }
    }

    // Supports only one workspace root
    // TODO this should store a refcount to avoid closing connections other consumers have a reference to
    /** Map from client root URI to connection */
    const connectionsByRootUri = new Map<string, Promise<LSPConnection>>()

    const withConnection = async <R>(
        workspaceFolder: URL,
        fn: (connection: LSPConnection) => Promise<R>
    ): Promise<R> => {
        let connection = await connectionsByRootUri.get(workspaceFolder.href)
        if (connection) {
            return fn(connection)
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
            connection.unsubscribe()
        }
    }

    function addRoot(root: sourcegraph.WorkspaceRoot): void {
        const connectionPromise = (async () => {
            try {
                const serverRootUri = clientToServerURI(root.uri)
                const connection = await connect({
                    clientRootUri: root.uri,
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

                subscriptions.add(
                    connection.closeEvent.subscribe(() => {
                        if (connectionsByRootUri.has(root.uri.toString())) {
                            logger.log(
                                'Refreshing WebSocket connection to language server'
                            )
                            addRoot(root)
                        }
                    })
                )

                return connection
            } catch (err) {
                logger.error('Error creating connection', err)
                connectionsByRootUri.delete(root.uri.toString())
                throw err
            }
        })()
        connectionsByRootUri.set(root.uri.toString(), connectionPromise)
    }

    function addRoots(added: readonly sourcegraph.WorkspaceRoot[]): void {
        for (const root of added) {
            addRoot(root)
        }
    }
    subscriptions.add(
        from(sourcegraph.workspace.rootChanges)
            .pipe(
                startWith(null),
                map(() => [...sourcegraph.workspace.roots]),
                scan((before, after) => {
                    // Create new connections for added workspaces
                    const added = differenceBy(after, before, root =>
                        root.uri.toString()
                    )
                    addRoots(added)

                    // Close connections for removed workspaces
                    const removed = differenceBy(before, after, root =>
                        root.uri.toString()
                    )
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    Promise.all(
                        removed.map(async root => {
                            try {
                                const connection = await connectionsByRootUri.get(
                                    root.uri.toString()
                                )

                                if (connection) {
                                    connectionsByRootUri.delete(
                                        root.uri.toString()
                                    )
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

    return {
        withConnection,
        unsubscribe: () => {
            subscriptions.unsubscribe()
        },
    }
}

function registrationId(
    staticOptions: Partial<Pick<lsp.Registration, 'id'>> | boolean | undefined
): string {
    return (
        (staticOptions &&
            typeof staticOptions === 'object' &&
            typeof staticOptions.id === 'string' &&
            staticOptions.id) ||
        uuid.v1()
    )
}

function staticRegistrationsFromCapabilities(
    capabilities: lsp.ServerCapabilities,
    defaultSelector: sourcegraph.DocumentSelector
): lsp.Registration[] {
    const staticRegistrations: lsp.Registration[] = []
    for (const feature of Object.values(features)) {
        const capability = capabilities[feature.capabilityName]
        if (capability) {
            staticRegistrations.push({
                method: feature.requestType.method,
                id: registrationId(capability),
                registerOptions: { documentSelector: defaultSelector },
            })
        }
    }
    return staticRegistrations
}

export function scopeDocumentSelectorToRoot(
    documentSelector: sourcegraph.DocumentSelector | null,
    clientRootUri: URL | null
): sourcegraph.DocumentSelector {
    if (!documentSelector || documentSelector.length === 0) {
        documentSelector = [{ pattern: '**' }]
    }
    if (!clientRootUri) {
        return documentSelector
    }
    return documentSelector
        .map(
            (filter): sourcegraph.DocumentFilter =>
                typeof filter === 'string' ? { language: filter } : filter
        )
        .map(filter => ({ ...filter, baseUri: clientRootUri }))
}
