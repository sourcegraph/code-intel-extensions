import '@babel/polyfill'

import {
    activateCodeIntel,
    LSPProviders,
    HandlerArgs,
} from '../../../shared/index'
import * as wsrpc from '@sourcegraph/vscode-ws-jsonrpc'
import { ajax } from 'rxjs/ajax'
import * as sourcegraph from 'sourcegraph'
import * as rpc from 'vscode-jsonrpc'
import * as lspProtocol from 'vscode-languageserver-protocol'
import * as lspTypes from 'vscode-languageserver-types'
import * as convert from './convert-lsp-to-sea'
import * as lspext from './lspext'

import * as path from 'path'
import { BehaviorSubject, from, Observable, Unsubscribable } from 'rxjs'
import {
    concatMap,
    distinctUntilChanged,
    map,
    mergeMap,
    scan,
    finalize,
} from 'rxjs/operators'

import {
    ConsoleLogger,
    createWebSocketConnection,
} from '@sourcegraph/vscode-ws-jsonrpc'
import gql from 'tagged-template-noop'
import { Settings } from './settings'

import {
    Hover,
    MarkupContent,
    Position,
    Range,
} from 'vscode-languageserver-types'

export const convertPosition = (
    sourcegraph: typeof import('sourcegraph'),
    position: Position
): sourcegraph.Position =>
    new sourcegraph.Position(position.line, position.character)

export const convertRange = (
    sourcegraph: typeof import('sourcegraph'),
    range: Range
): sourcegraph.Range =>
    new sourcegraph.Range(
        convertPosition(sourcegraph, range.start),
        convertPosition(sourcegraph, range.end)
    )

export function convertHover(
    sourcegraph: typeof import('sourcegraph'),
    hover: Hover | null
): sourcegraph.Hover | null {
    if (!hover) {
        return null
    }
    const contents = Array.isArray(hover.contents)
        ? hover.contents
        : [hover.contents]
    return {
        range: hover.range && convertRange(sourcegraph, hover.range),
        contents: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: contents
                .map(content => {
                    if (MarkupContent.is(content)) {
                        // Assume it's markdown. To be correct, markdown would need to be escaped for non-markdown kinds.
                        return content.value
                    }
                    if (typeof content === 'string') {
                        return content
                    }
                    if (!content.value) {
                        return ''
                    }
                    return (
                        '```' +
                        content.language +
                        '\n' +
                        content.value +
                        '\n```'
                    )
                })
                .filter(str => !!str.trim())
                .join('\n\n---\n\n'),
        },
    }
}

// If we can rid ourselves of file:// URIs, this type won't be necessary and we
// can use lspext.Xreference directly.
type XRef = lspext.Xreference & { currentDocURI: string }

// Useful when go-langserver is running in a Docker container.
function sourcegraphURL(): URL {
    const url =
        (sourcegraph.configuration.get<Settings>().get('go.sourcegraphUrl') as
            | string
            | undefined) || sourcegraph.internal.sourcegraphURL.toString()
    try {
        return new URL(url)
    } catch (e) {
        if ('message' in e && /Invalid URL/.test(e.message)) {
            console.error(
                new Error(
                    [
                        `Invalid go.sourcegraphUrl ${url} in your Sourcegraph settings.`,
                        `Make sure it is set to the address of Sourcegraph from the perspective of the language server (e.g. http://sourcegraph-frontend:30080).`,
                        `Read the full documentation for more information: https://github.com/sourcegraph/sourcegraph-go`,
                    ].join('\n')
                )
            )
        }
        throw e
    }
}

interface AccessTokenResponse {
    currentUser: {
        accessTokens: {
            nodes: { note: string }[]
            pageInfo: {
                hasNextPage: boolean
            }
        }
    }
    errors: string[]
}

async function userHasAccessTokenWithNote(note: string): Promise<boolean> {
    const response: AccessTokenResponse = await queryGraphQL(`
    query {
        currentUser {
            accessTokens(first: 1000) {
                nodes {
                    note
                },
                pageInfo {
                    hasNextPage
                }
            }
        }
    }
    `)

    if (
        !response ||
        !response.currentUser ||
        !response.currentUser.accessTokens ||
        !response.currentUser.accessTokens.nodes ||
        !Array.isArray(response.currentUser.accessTokens.nodes)
    ) {
        return false
    }
    if (
        response.currentUser.accessTokens.pageInfo &&
        response.currentUser.accessTokens.pageInfo.hasNextPage
    ) {
        throw new Error('You have too many access tokens (over 1000).')
    }
    return response.currentUser.accessTokens.nodes.some(
        token => token.note === note
    )
}

/**
 * Returns a URL to Sourcegraph's raw API, given a repo, rev, and optional
 * token. When the token is not provided, the resulting URL will not be
 * authenticated.
 *
 * @param repoName looks like `github.com/gorilla/mux`
 * @param revision whatever Sourcegraph's raw API supports (40 char hash,
 * `master`, etc.)
 * @param token an authentication token for the current user
 */
function constructZipURL({
    repoName,
    revision,
    token,
}: {
    repoName: string
    revision: string
    token: string | undefined
}): string {
    const zipURL = sourcegraphURL()
    // URL.pathname is different on Chrome vs Safari, so don't rely on it.
    return (
        zipURL.protocol +
        '//' +
        (token ? token + '@' : '') +
        zipURL.host +
        '/' +
        repoName +
        '@' +
        encodeURIComponent(revision) +
        '/-/raw'
    )
}

// Returns a URL template to the raw API. For example: 'https://%s@localhost:3080/%s@%s/-/raw'
function zipURLTemplate(token: string | undefined): string | undefined {
    const url = sourcegraphURL()
    return (
        url.protocol +
        '//' +
        (token ? token + '@' : '') +
        url.host +
        '/%s@%s/-/raw'
    )
}

async function queryGraphQL(query: string, variables: any = {}): Promise<any> {
    const { data, errors } = await sourcegraph.commands.executeCommand(
        'queryGraphQL',
        query,
        variables
    )
    if (errors) {
        throw Object.assign(
            new Error(errors.map((err: any) => err.message).join('\n')),
            { errors }
        )
    }
    return data
}

const NOTE_FOR_GO_ACCESS_TOKEN = 'go'

// Undefined means the current user is anonymous.
let accessTokenPromise: Promise<string | undefined>
export async function getOrTryToCreateAccessToken(): Promise<
    string | undefined
> {
    const hasToken = await userHasAccessTokenWithNote(NOTE_FOR_GO_ACCESS_TOKEN)
    const setting = sourcegraph.configuration
        .get<Settings>()
        .get('go.accessToken')
    if (hasToken && setting) {
        return setting
    } else {
        return (
            accessTokenPromise ||
            (accessTokenPromise = tryToCreateAccessToken())
        )
    }
}

async function tryToCreateAccessToken(): Promise<string | undefined> {
    const { currentUser } = await queryGraphQL(gql`
        query {
            currentUser {
                id
            }
        }
    `)
    if (!currentUser) {
        return undefined
    } else {
        const currentUserId: string = currentUser.id
        const result = await queryGraphQL(
            gql`
                mutation CreateAccessToken(
                    $user: ID!
                    $scopes: [String!]!
                    $note: String!
                ) {
                    createAccessToken(
                        user: $user
                        scopes: $scopes
                        note: $note
                    ) {
                        id
                        token
                    }
                }
            `,
            {
                user: currentUserId,
                scopes: ['user:all'],
                note: NOTE_FOR_GO_ACCESS_TOKEN,
            }
        )
        const token: string = result.createAccessToken.token
        await sourcegraph.configuration
            .get<Settings>()
            .update('go.accessToken', token)
        return token
    }
}

async function connectAndInitialize(
    address: string,
    root: URL,
    token: string | undefined
): Promise<rpc.MessageConnection> {
    const connectingToGoLangserverHelp = [
        `Unable to connect to the Go language server at ${address}.`,
        `Make sure ${'go.address' as keyof Settings} in your Sourcegraph settings is set to the address of the language server (e.g. wss://sourcegraph.example.com/go).`,
        `Read the full documentation for more information: https://github.com/sourcegraph/sourcegraph-go`,
    ].join('\n')

    const connectingToSourcegraphHelp = [
        `The Go language server running on ${address} was unable to fetch repository contents from Sourcegraph running on ${sourcegraphURL()}.`,
        `Make sure ${'go.sourcegraphUrl' as keyof Settings} in your settings is set to the address of Sourcegraph from the perspective of the language server (e.g. http://sourcegraph-frontend:30080 when running in Kubernetes).`,
        `Read the full documentation for more information: https://github.com/sourcegraph/sourcegraph-go`,
    ].join('\n')

    const connection = (await new Promise((resolve, reject) => {
        try {
            const webSocket = new WebSocket(address)
            const conn = createWebSocketConnection(
                wsrpc.toSocket(webSocket),
                new ConsoleLogger()
            )
            webSocket.addEventListener('open', () => resolve(conn))
            webSocket.addEventListener('error', event =>
                reject(new Error(connectingToGoLangserverHelp))
            )
        } catch (e) {
            if ('message' in e && /Failed to construct/.test(e.message)) {
                console.error(connectingToGoLangserverHelp)
            }
            reject(e)
        }
    })) as rpc.MessageConnection

    connection.listen()
    try {
        await connection.sendRequest(
            new lspProtocol.RequestType<
                lspProtocol.InitializeParams & {
                    originalRootUri: string
                    rootPath: string
                },
                lspProtocol.InitializeResult,
                lspProtocol.InitializeError,
                void
            >('initialize') as any,
            {
                originalRootUri: root.href,
                rootUri: 'file:///',
                rootPath: '/',
                initializationOptions: {
                    zipURL: constructZipURL({
                        repoName: repoName(root.href).replace(/^\/+/, ''),
                        revision: root.search.substr(1),
                        token,
                    }),
                    zipURLTemplate: zipURLTemplate(token),
                },
            }
        )
    } catch (e) {
        if (
            'message' in e &&
            (/no such host/.test(e.message) || /i\/o timeout/.test(e.message))
        ) {
            console.error(connectingToSourcegraphHelp)
        }
        throw e
    }

    connection.sendNotification(lspProtocol.InitializedNotification.type)

    return connection
}

interface SendRequestParams {
    rootURI: URL
    requestType: any
    request: any
    useCache: boolean
}

type SendRequest<T> = (params: SendRequestParams) => Promise<T>

function rootURIFromDoc(doc: sourcegraph.TextDocument): URL {
    const url = new URL(doc.uri)
    url.hash = ''
    return url
}

function repoNameFromDoc(doc: sourcegraph.TextDocument): string {
    const url = new URL(doc.uri)
    return path.join(url.hostname, url.pathname.slice(1))
}

/**
 * Creates a function of type SendRequest that can be used to send LSP requests
 * to the corresponding language server. This returns an Unsubscribable so that
 * all the connections to that language server can be disposed of when calling
 * .unsubscribe().
 *
 * Internally, this maintains a mapping from rootURI to the connection
 * associated with that rootURI, so it supports multiple roots (untested).
 */
function mkSendRequest<T>(
    address: string,
    token: string | undefined
): { sendRequest: SendRequest<T> } & Unsubscribable {
    const rootURIToConnection: {
        [rootURI: string]: Promise<rpc.MessageConnection>
    } = {}
    async function connectionFor(root: URL): Promise<rpc.MessageConnection> {
        if (rootURIToConnection[root.href]) {
            return rootURIToConnection[root.href]
        } else {
            rootURIToConnection[root.href] = connectAndInitialize(
                address,
                root,
                token
            )
            const connection = await rootURIToConnection[root.href]
            connection.onDispose(() => {
                delete rootURIToConnection[root.href]
            })
            connection.onClose(() => {
                delete rootURIToConnection[root.href]
            })
            return connection
        }
    }

    const sendRequest: SendRequest<any> = async ({
        rootURI,
        requestType,
        request,
        useCache,
    }) => {
        if (useCache) {
            return await (await connectionFor(rootURI)).sendRequest(
                requestType,
                request
            )
        } else {
            const connection = await connectAndInitialize(
                address,
                rootURI,
                token
            )
            const response = await connection.sendRequest(requestType, request)
            connection.dispose()
            return response
        }
    }

    return {
        sendRequest,
        unsubscribe: () => {
            for (const rootURI of Object.keys(rootURIToConnection)) {
                if (rootURIToConnection[rootURI]) {
                    // tslint:disable-next-line: no-floating-promises
                    rootURIToConnection[rootURI].then(connection =>
                        connection.dispose()
                    )
                    delete rootURIToConnection[rootURI]
                }
            }
        },
    }
}

interface FileMatch {
    repository: {
        name: string
    }
}

interface SearchResponse {
    search: {
        results: {
            results: FileMatch[]
        }
    }
    errors: string[]
}

interface GDDOImportersResponse {
    results: { path: string }[]
}

async function repositoriesThatImportViaGDDO(
    buildGDDOURL: (path: string) => string,
    importPath: string,
    limit: number
): Promise<Set<string>> {
    const response = (
        await ajax({
            url: buildGDDOURL(importPath),
            responseType: 'json',
        }).toPromise()
    ).response as GDDOImportersResponse
    if (!response || !response.results || !Array.isArray(response.results)) {
        throw new Error('Invalid response from godoc.org:' + response)
    } else {
        const repoNames: string[] = (
            await Promise.all(
                response.results
                    .map(result => result.path)
                    .filter(path =>
                        // This helps filter out repos that do not exist on the Sourcegraph.com instance
                        path.startsWith('github.com/')
                    )
                    .map(path => {
                        // Chop off portion after "github.com/owner/repo".
                        const parts = path.split('/')
                        return parts.slice(0, 3).join('/')
                    })
                    .filter(repo => !!repo)
                    .slice(0, limit)
                    .map(async repo => {
                        try {
                            const gqlResponse = await queryGraphQL(
                                `
                        query($cloneURL: String!) {
                            repository(cloneURL: $cloneURL) {
                                name
                            }
                        }
                    `,
                                { cloneURL: repo }
                            )
                            if (
                                !gqlResponse ||
                                !gqlResponse.repository ||
                                !gqlResponse.repository.name
                            ) {
                                // We only know how to construct zip URLs for fetching repos
                                // on Sourcegraph instances. Since this candidate repo is absent from
                                // the Sourcegraph instance, discard it.
                                return undefined
                            }
                            return gqlResponse.repository.name as string
                        } catch (err) {
                            if (
                                err.message &&
                                err.message.includes('ExternalRepo:<nil>')
                            ) {
                                console.warn(
                                    `Unable to find cross-repository references in ${repo}, probably because the repository was renamed and Sourcegraph does not support renamed repositories yet.`
                                )
                            } else {
                                console.warn(err)
                            }
                            return undefined
                        }
                    })
            )
        ).filter((repo): repo is string => !!repo)
        return new Set(
            repoNames.map(name => {
                function modifyComponents(
                    f: (components: string[]) => string[],
                    path: string
                ): string {
                    return f(path.split('/')).join('/')
                }
                // Converts import paths to repositories by stripping everything
                // after the third path component. This is not very accurate,
                // and breaks when the repository is not a prefix of the import
                // path.
                return modifyComponents(
                    components => components.slice(0, 3),
                    name
                )
            })
        )
    }
}

/**
 * Returns an array of repositories that import the given import path.
 */
async function repositoriesThatImportViaSearch(
    importPath: string,
    limit: number
): Promise<Set<string>> {
    const query = `\t"${importPath}"`
    const data = (await queryGraphQL(
        `
query FindDependents($query: String!) {
  search(query: $query) {
    results {
      results {
        ... on FileMatch {
          repository {
            name
          }
        }
      }
    }
  }
}
	`,
        { query }
    )) as SearchResponse
    if (
        !data ||
        !data.search ||
        !data.search.results ||
        !data.search.results.results ||
        !Array.isArray(data.search.results.results)
    ) {
        throw new Error('No search results - this should not happen.')
    }
    return new Set(
        data.search.results.results
            .filter(r => r.repository)
            .map(r => r.repository.name)
            .slice(0, limit)
    )
}

/**
 * Finds external references to the symbol at the given position in a 3 step
 * process:
 *
 * - Call xdefinition to get the symbol name and package
 * - Run a search for files that import the symbol's package, and aggregate the
 *   set of matching repositories
 * - Loop through each repository, create a new connection to the language
 *   server, and call xreferences
 */
function xrefs({
    doc,
    pos,
    sendRequest,
}: {
    doc: sourcegraph.TextDocument
    pos: sourcegraph.Position
    sendRequest: SendRequest<any>
}): Observable<lspext.Xreference & { currentDocURI: string }> {
    const candidates = (async () => {
        const definitions = (await sendRequest({
            rootURI: rootURIFromDoc(doc),
            requestType: new lspProtocol.RequestType<any, any, any, void>(
                'textDocument/xdefinition'
            ) as any,
            request: positionParams(doc, pos),
            useCache: true,
        })) as lspext.Xdefinition[] | null
        if (!definitions) {
            console.error('No response to xdefinition')
            return Promise.reject()
        }
        if (definitions.length === 0) {
            console.error('No definitions')
            return Promise.reject()
        }
        const definition = definitions[0]
        const limit =
            sourcegraph.configuration
                .get<Settings>()
                .get('go.maxExternalReferenceRepos') || 20
        const gddoURL = sourcegraph.configuration
            .get<Settings>()
            .get('go.gddoURL')
        const corsAnywhereURL = sourcegraph.configuration
            .get<Settings>()
            .get('go.corsAnywhereURL')
        function composeForward<A, B, C>(
            f: (a: A) => B,
            g: (b: B) => C
        ): (a: A) => C {
            return a => g(f(a))
        }
        function identity<A>(a: A): A {
            return a
        }
        function mkBuildGDDOURL(gddoURL: string): (path: string) => string {
            return composeForward(
                (path: string): string => {
                    const importersURL = new URL(gddoURL)
                    importersURL.pathname = 'importers/' + path
                    return importersURL.href
                },
                corsAnywhereURL
                    ? (url: string): string => corsAnywhereURL + url
                    : (identity as (url: string) => string)
            )
        }
        const repositoriesThatImport = gddoURL
            ? (importPath: string, limit: number) =>
                  repositoriesThatImportViaGDDO(
                      mkBuildGDDOURL(gddoURL),
                      importPath,
                      limit
                  )
            : repositoriesThatImportViaSearch
        const repos = new Set(
            Array.from(
                await repositoriesThatImport(definition.symbol.package, limit)
            )
        )
        // Skip the current repository because the local references provider will cover it.
        repos.delete(repoNameFromDoc(doc))
        // Assumes the import path is the same as the repo name - not always true!
        repos.delete(definition.symbol.package)
        return Array.from(repos).map(repo => ({ repo, definition }))
    })()

    return from(candidates).pipe(
        concatMap(candidates => candidates),
        mergeMap(
            async ({ repo, definition }) => {
                const rootURI = new URL(`git://${repo}?HEAD`)
                // This creates a new connection and immediately disposes it because
                // each xreferences request here has a different rootURI (enforced
                // by `new Set` above), rendering caching useless.
                const response = (await sendRequest({
                    rootURI,
                    requestType: new lspProtocol.RequestType<
                        any,
                        any,
                        any,
                        void
                    >('workspace/xreferences') as any,
                    // tslint:disable-next-line:no-object-literal-type-assertion
                    request: {
                        query: definition.symbol,
                        limit: 20,
                    } as { query: lspext.LSPSymbol; limit: number },
                    useCache: false,
                })) as lspext.Xreference[]

                return (response || []).map(ref => ({
                    ...ref,
                    currentDocURI: rootURI.href,
                }))
            },
            10 // 10 concurrent connections
        ),
        concatMap(references => references)
    )
}

function positionParams(
    doc: sourcegraph.TextDocument,
    pos: sourcegraph.Position
): lspProtocol.TextDocumentPositionParams {
    return {
        textDocument: {
            uri: `file:///${new URL(doc.uri).hash.slice(1)}`,
        },
        position: {
            line: pos.line,
            character: pos.character,
        },
    }
}

/**
 * Automatically registers/deregisters a provider based on the given predicate of the settings.
 */
function registerWhile({
    register,
    settingsPredicate,
    settings,
}: {
    register: () => sourcegraph.Unsubscribable
    settingsPredicate: (settings: Settings) => boolean
    settings: Observable<Settings>
}): sourcegraph.Unsubscribable {
    let registration: sourcegraph.Unsubscribable | undefined
    return from(settings)
        .pipe(
            map(settingsPredicate),
            distinctUntilChanged(),
            map(enabled => {
                if (enabled) {
                    registration = register()
                } else {
                    if (registration) {
                        registration.unsubscribe()
                        registration = undefined
                    }
                }
            }),
            finalize(() => {
                if (registration) {
                    registration.unsubscribe()
                    registration = undefined
                }
            })
        )
        .subscribe()
}

function registerExternalReferences({
    ctx,
    sendRequest,
    settings,
}: {
    ctx: sourcegraph.ExtensionContext
    sendRequest: SendRequest<any>
    settings: Observable<Settings>
}): void {
    ctx.subscriptions.add(
        registerWhile({
            register: () =>
                sourcegraph.languages.registerReferenceProvider(
                    [{ pattern: '*.go' }],
                    {
                        provideReferences: (
                            doc: sourcegraph.TextDocument,
                            pos: sourcegraph.Position
                        ) =>
                            xrefs({
                                doc,
                                pos,
                                sendRequest,
                            }).pipe(
                                scan(
                                    (acc: XRef[], curr: XRef) => [...acc, curr],
                                    [] as XRef[]
                                ),
                                map(response =>
                                    convert.xreferences({
                                        references: response,
                                    })
                                )
                            ),
                    }
                ),
            settingsPredicate: settings =>
                Boolean(settings['go.showExternalReferences']),
            settings,
        })
    )
}

function registerImplementations({
    ctx,
    sendRequest,
}: {
    ctx: sourcegraph.ExtensionContext
    sendRequest: SendRequest<lspTypes.Location[] | null>
}): void {
    // Implementations panel.
    const IMPL_ID = 'go.impl' // implementations panel and provider ID
    ctx.subscriptions.add(
        sourcegraph.languages.registerLocationProvider(
            IMPL_ID,
            [{ pattern: '*.go' }],
            {
                provideLocations: async (
                    doc: sourcegraph.TextDocument,
                    pos: sourcegraph.Position
                ) => {
                    const response = await sendRequest({
                        rootURI: rootURIFromDoc(doc),
                        requestType: lspProtocol.ImplementationRequest.type,
                        request: positionParams(doc, pos),
                        useCache: true,
                    })
                    return convert.references({
                        currentDocURI: doc.uri,
                        references: response,
                    })
                },
            }
        )
    )
    const panelView = sourcegraph.app.createPanelView(IMPL_ID)
    panelView.title = 'Go ifaces/impls'
    panelView.component = { locationProvider: IMPL_ID }
    panelView.priority = 160
    ctx.subscriptions.add(panelView)
}

/**
 * Uses WebSockets to communicate with a language server.
 */
export async function initLSP(
    ctx: sourcegraph.ExtensionContext
): Promise<LSPProviders | undefined> {
    const settings: BehaviorSubject<Settings> = new BehaviorSubject<Settings>(
        {}
    )
    ctx.subscriptions.add(
        sourcegraph.configuration.subscribe(() => {
            settings.next(sourcegraph.configuration.get<Settings>().value)
        })
    )
    const accessToken = await getOrTryToCreateAccessToken()
    const langserverAddress = sourcegraph.configuration
        .get<Settings>()
        .get('go.serverUrl')
    if (!langserverAddress) {
        return undefined
    }

    const unsubscribableSendRequest = mkSendRequest<any>(
        langserverAddress,
        accessToken
    )
    const sendRequest = <T>(
        ...args: Parameters<typeof unsubscribableSendRequest.sendRequest>
    ): Promise<T> => unsubscribableSendRequest.sendRequest(...args)
    ctx.subscriptions.add(unsubscribableSendRequest)

    async function* hover(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Hover | null, void, undefined> {
        yield convertHover(
            sourcegraph,
            await sendRequest<lspTypes.Hover | null>({
                rootURI: rootURIFromDoc(doc),
                requestType: lspProtocol.HoverRequest.type,
                request: positionParams(doc, pos),
                useCache: true,
            })
        )
    }

    async function* definition(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Definition, void, undefined> {
        yield convert.xdefinition({
            currentDocURI: doc.uri,
            xdefinition: await sendRequest<lspext.Xdefinition[] | null>({
                rootURI: rootURIFromDoc(doc),
                requestType: new lspProtocol.RequestType<any, any, any, void>(
                    'textDocument/xdefinition'
                ) as any,
                request: positionParams(doc, pos),
                useCache: true,
            }),
        })
    }

    async function* references(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        yield convert.references({
            currentDocURI: doc.uri,
            references: await sendRequest<lspTypes.Location[]>({
                rootURI: rootURIFromDoc(doc),
                requestType: lspProtocol.ReferencesRequest.type,
                request: positionParams(doc, pos),
                useCache: true,
            }),
        })
    }

    registerExternalReferences({ ctx, sendRequest, settings })
    registerImplementations({ ctx, sendRequest })

    return {
        hover,
        definition,
        references,
    }
}

export function isLSPEnabled(): boolean {
    return Boolean(
        sourcegraph.configuration.get<Settings>().get('go.serverUrl')
    )
}

function repoName(url: string): string {
    let pathname = url
    pathname = pathname.slice('git://'.length)
    pathname = pathname.slice(0, pathname.indexOf('?'))
    return pathname
}

const handlerArgs: HandlerArgs = {
    sourcegraph,
    languageID: 'go',
    fileExts: ['go'],
    filterDefinitions: ({ repo, filePath, pos, fileContent, results }) => {
        const currentFileImportedPaths = fileContent
            .split('\n')
            .map(line => {
                // Matches the import at index 3
                const match = /^(import |\t)(\w+ |\. )?"(.*)"$/.exec(line)
                return match ? match[3] : undefined
            })
            .filter((x): x is string => Boolean(x))

        const currentFileImportPath = repo + '/' + path.dirname(filePath)

        const filteredResults = results.filter(result => {
            const resultImportPath =
                result.repo + '/' + path.dirname(result.file)
            return (
                currentFileImportedPaths.some(i =>
                    resultImportPath.includes(i)
                ) || resultImportPath === currentFileImportPath
            )
        })

        return filteredResults.length === 0 ? results : filteredResults
    },
    commentStyle: {
        lineRegex: /\/\/\s?/,
    },
}

// No-op for Sourcegraph versions prior to 3.0.
const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

const goFiles = [{ pattern: '*.go' }]

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    async function afterActivate(): Promise<void> {
        activateCodeIntel(ctx, goFiles, handlerArgs, await initLSP(ctx))
    }
    setTimeout(afterActivate, 100)
}
