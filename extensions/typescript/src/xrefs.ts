import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { LSPClient } from '../../../shared/lsp/client'
import { convertLocation, toLocation } from '../../../shared/lsp/conversion'
import { ReferencesProvider } from '../../../shared/providers'
import {    API} from '../../../shared/util/api'
import { asArray, isDefined } from '../../../shared/util/helpers'
import { concat, flatMapConcurrent } from '../../../shared/util/ix'
import {
    gitToRawApiUri,
    rawApiToGitUri,
    removeHash,
} from '../../../shared/util/uri'
import { findPackageName, resolvePackageRepo } from './package'
import { Settings } from './settings'

const EXTERNAL_REFS_CONCURRENCY = 7

// We use this type alias that rewrites the `Location[] | LocationLink[]` portion
// of the DefinitionRequest result type into an type that is accepted by Array.map.
type DefinitionResult =
    | lsp.Location
    | (lsp.Location | lsp.LocationLink)[]
    | null

/**
 * Return external references to the symbol at the given position.
 *
 * @param args Parameter bag.
* @param api The GraphQL API instance.
 */
export function createExternalReferencesProvider({
    client,
    settings,
    sourcegraphServerURL,
    sourcegraphClientURL,
    accessToken,
}: {
    /** The LSP client. */
    client: LSPClient
    /** The current settings. */
    settings: Settings
    /** A URL of the Sourcegraph API reachable from the language server. */
    sourcegraphServerURL: URL
    /** A URL of the Sourcegraph API reachable from the browser. */
    sourcegraphClientURL: URL
    /** The access token. */
    accessToken: string
},
api: API = new API()
): ReferencesProvider {
    const limit = settings['typescript.maxExternalReferenceRepos'] || 20

    const findDependents = async (packageName: string): Promise<string[]> => {
        // If the package name is "sourcegraph", we are looking for references to
        // a symbol in the Sourcegraph extension API. Extensions are not published
        // to npm, so search the extension registry.
        if (packageName === 'sourcegraph') {
            return (
                await Promise.all(
                    (await api.getExtensionManifests())
                        .slice(0, limit)
                        .map(rawManifest => resolvePackageRepo(rawManifest))
                )
            ).filter(isDefined)
        }

        return api.findReposViaSearch(
            `file:package.json$ ${packageName} max:${limit}`
        )
    }

    return async function*(
        textDocument: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        // Get the symbol and package at the current position
        const definitions = await getDefinition(
            client,
            sourcegraphServerURL,
            accessToken,
            textDocument,
            position
        )
        if (definitions.length === 0) {
            console.error('No definitions')
            return
        }
        const definition = definitions[0]

        const definitionClientUri = new URL(definition.uri)
        definitionClientUri.protocol = sourcegraphClientURL.protocol
        definitionClientUri.host = sourcegraphClientURL.host

        // Find dependent repositories.
        const dependents = await findDependents(
            await findPackageName(definitionClientUri)
        )

        yield* concat(
            flatMapConcurrent(dependents, EXTERNAL_REFS_CONCURRENCY, repoName =>
                // Call references for the target symbol in each dependent workspace
                findExternalRefsInDependent(
                    api,
                    client,
                    sourcegraphServerURL,
                    accessToken,
                    repoName,
                    definition
                )
            )
        )
    }
}

async function getDefinition(
    client: LSPClient,
    sourcegraphServerURL: URL,
    accessToken: string,
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<lsp.Location[]> {
    const workspaceRoot = removeHash(new URL(textDocument.uri))

    const params = {
        textDocument: {
            uri: gitToRawApiUri(
                sourcegraphServerURL,
                accessToken,
                new URL(textDocument.uri)
            ).href,
        },
        position,
    }

    const result: DefinitionResult = await client.withConnection(
        workspaceRoot,
        async connection =>
            (await connection.sendRequest(
                lsp.DefinitionRequest.type,
                params
            )) || []
    )

    return asArray(result).map(toLocation)
}

async function findExternalRefsInDependent(
    api:API,
    client: LSPClient,
    sourcegraphServerURL: URL,
    accessToken: string,
    repoName: string,
    definition: lsp.Location
): Promise<sourcegraph.Location[]> {
    const commit = await api.resolveRev(repoName, 'HEAD')
    if (!commit) {
        return []
    }
    const rootUri = new URL(
        `${repoName}@${commit}/-/raw/`,
        sourcegraphServerURL
    )
    if (accessToken) {
        rootUri.username = accessToken
    }

    const workspaceRoot = rawApiToGitUri(rootUri)

    const params = {
        textDocument: { uri: definition.uri },
        position: definition.range.start,
        context: { includeDeclaration: false },
    }

    const results = await client.withConnection(
        workspaceRoot,
        async connection =>
            (await connection.sendRequest(
                lsp.ReferencesRequest.type,
                params
            )) || []
    )

    return (
        results
            // Filter out results that weren't in the workspace
            .filter(location => location.uri.startsWith(rootUri.href))
            .map(location =>
                convertLocation({
                    ...location,
                    uri: rawApiToGitUri(new URL(location.uri)).href,
                })
            )
    )
}
