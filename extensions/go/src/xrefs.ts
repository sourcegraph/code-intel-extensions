import * as path from 'path'
import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { LSPClient } from '../../../shared/lsp/client'
import { convertRange } from '../../../shared/lsp/conversion'
import { ReferencesProvider } from '../../../shared/providers'
import { findReposViaSearch } from '../../../shared/util/api'
import { notIn } from '../../../shared/util/helpers'
import { concat, flatMapConcurrent } from '../../../shared/util/ix'
import { removeHash, withHash } from '../../../shared/util/uri'
import { findReposViaGDDO } from './gddo'
import { Settings } from './settings'

const EXTERNAL_REFS_CONCURRENCY = 7

interface SymbolDescriptor {
    package: string
    packageName: string
    recv: string
    name: string
    iD: string
    vendor: boolean
}

interface Xreference {
    reference: lsp.Location
    currentDocURI: string
}

const xdefinitionRequestType = new lsp.RequestType<
    lsp.TextDocumentPositionParams,
    { symbol: SymbolDescriptor }[] | null,
    any,
    void
>('textDocument/xdefinition')

const xdefinitionWorkspaceRequestType = new lsp.RequestType<
    { query: SymbolDescriptor; limit?: number },
    Xreference[] | null,
    any,
    void
>('workspace/xreferences')

/**
 * Return external references to the symbol at the given position.
 *
 * @param args Parameter bag.
 */
export function createExternalReferencesProvider({
    client,
    settings,
}: {
    /** The LSP client. */
    client: LSPClient
    /** The current settings. */
    settings: Settings
}): ReferencesProvider {
    const gddoURL = settings['go.gddoURL']
    const corsAnywhereURL = settings['go.corsAnywhereURL']
    const limit = settings['go.maxExternalReferenceRepos'] || 20

    const findDependents = async (packageName: string): Promise<string[]> => {
        if (gddoURL) {
            return findReposViaGDDO(
                gddoURL,
                corsAnywhereURL,
                packageName,
                limit
            )
        }

        // TODO - support named imports
        return findReposViaSearch(`file:\\.go$ \t"${packageName}" max:${limit}`)
    }

    return async function*(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        // Get the symbol and package at the current position
        const definitions = await getDefinition(client, doc, pos)
        if (definitions.length === 0) {
            console.error('No definitions')
            return
        }
        const { symbol } = definitions[0]

        const rootURI = removeHash(new URL(doc.uri))
        const { hostname, pathname } = new URL(doc.uri)
        const repoName = path.join(hostname, pathname.slice(1))

        // Find dependent repositories. Remove results that refer to the source
        // repository or package. These results are already covered via the default
        // LSP references provider.

        const dependents = (await findDependents(symbol.package)).filter(
            notIn([repoName, symbol.package])
        )

        yield* concat(
            flatMapConcurrent(dependents, EXTERNAL_REFS_CONCURRENCY, repoName =>
                // Call references for the target symbol in each dependent workspace
                findExternalRefsInDependent(client, repoName, rootURI, symbol)
            )
        )
    }
}

function getDefinition(
    client: LSPClient,
    doc: sourcegraph.TextDocument,
    pos: sourcegraph.Position
): Promise<{ symbol: SymbolDescriptor }[]> {
    const workspaceRoot = removeHash(new URL(doc.uri))

    const params = {
        textDocument: {
            uri: doc.uri,
        },
        position: pos,
    }

    return client.withConnection(
        workspaceRoot,
        async conn =>
            (await conn.sendRequest(xdefinitionRequestType, params)) || []
    )
}

async function findExternalRefsInDependent(
    client: LSPClient,
    repoName: string,
    rootURI: URL,
    symbol: SymbolDescriptor
): Promise<sourcegraph.Location[]> {
    const workspaceRoot = new URL(`git://${repoName}?HEAD`)

    const params = {
        query: symbol,
        limit: 20,
    }

    const results = await client.withConnection(
        workspaceRoot,
        async conn =>
            (await conn.sendRequest(xdefinitionWorkspaceRequestType, params)) ||
            []
    )

    return results.map(
        ({ reference: { uri, range } }) =>
            new sourcegraph.Location(
                uri.startsWith('file:///')
                    ? withHash(rootURI, uri.slice('file:///'.length))
                    : new URL(uri),
                convertRange(range)
            )
    )
}
