import * as sourcegraph from 'sourcegraph'
import { LSIFProviders } from './providers'
import { convertHover, convertLocations } from './lsp-conversion'
import { pathFromDoc, repositoryFromDoc, commitFromDoc } from './util'
import * as LSP from 'vscode-languageserver-types'
import { queryGraphQL } from '../graphql'

export function initHTTP(): LSIFProviders {
    const isLSIFAvailable = createLSIFAvailablilityCheck()

    const ensureExists = <T>(
        f: (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ) => Promise<T | undefined>
    ): ((
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => Promise<T | undefined>) => {
        return async (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ) => ((await isLSIFAvailable(doc)) ? await f(doc, pos) : undefined)
    }

    return {
        // You can read this as "only send a hover request when LSIF data is
        // available for the given doc".
        definition: ensureExists(definition),
        references: ensureExists(references),
        hover: ensureExists(hover),
    }
}

/**
 * Creates an asynchronous predicate on a doc that checks for the existence of
 * LSIF data for the given doc. It's a constructor because it creates an
 * internal cache to reduce network traffic.
 */
const createLSIFAvailablilityCheck = () => {
    const lsifDocs = new Map<string, Promise<boolean>>()
    return (doc: sourcegraph.TextDocument): Promise<boolean> => {
        if (!sourcegraph.configuration.get().get('codeIntel.lsif')) {
            console.log('LSIF is not enabled in global settings')
            return Promise.resolve(false)
        }

        if (lsifDocs.has(doc.uri)) {
            return lsifDocs.get(doc.uri)!
        }

        const repository = repositoryFromDoc(doc)
        const commit = commitFromDoc(doc)
        const file = pathFromDoc(doc)

        const url = new URL(
            '.api/lsif/exists',
            sourcegraph.internal.sourcegraphURL
        )
        url.searchParams.set('repository', repository)
        url.searchParams.set('commit', commit)
        url.searchParams.set('file', file)

        const hasLSIFPromise = (async () => {
            try {
                // Prevent leaking the name of a private repository to
                // Sourcegraph.com by relying on the Sourcegraph extension host's
                // private repository detection, which will throw an error when
                // making a GraphQL request.
                await queryGraphQL({
                    query: `query { currentUser { id } }`,
                    vars: {},
                    sourcegraph,
                })
            } catch (e) {
                return false
            }
            const response = await fetch(url.href, {
                method: 'POST',
                headers: new Headers({
                    'x-requested-with': 'Basic code intel',
                }),
            })
            if (!response.ok) {
                return false
            }
            return response.json()
        })()

        lsifDocs.set(doc.uri, hasLSIFPromise)
        return hasLSIFPromise
    }
}

async function definition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Definition | undefined> {
    const body: LSP.Location | LSP.Location[] | null = await queryLSIF({
        doc,
        method: 'definitions',
        path: pathFromDoc(doc),
        position,
    })
    if (!body) {
        return undefined
    }
    const locations = Array.isArray(body) ? body : [body]
    if (locations.length === 0) {
        return undefined
    }
    return convertLocations(
        sourcegraph,
        locations.map(d => ({ ...d, uri: setPath(doc, d.uri) }))
    )
}

async function references(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Location[]> {
    const body: LSP.Location[] | null = await queryLSIF({
        doc,
        method: 'references',
        path: pathFromDoc(doc),
        position,
    })
    if (!body) {
        return []
    }
    const locations = Array.isArray(body) ? body : [body]
    if (locations.length === 0) {
        return []
    }
    return convertLocations(
        sourcegraph,
        locations.map(r => ({ ...r, uri: setPath(doc, r.uri) }))
    )
}

async function hover(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Hover | undefined> {
    const hover: LSP.Hover | null = await queryLSIF({
        doc,
        method: 'hover',
        path: pathFromDoc(doc),
        position,
    })
    if (!hover) {
        return undefined
    }
    return convertHover(sourcegraph, hover)
}

async function queryLSIF({
    doc,
    method,
    path,
    position,
}: {
    doc: sourcegraph.TextDocument
    method: string
    path: string
    position: LSP.Position
}): Promise<any> {
    const url = new URL(
        '.api/lsif/request',
        sourcegraph.internal.sourcegraphURL
    )
    url.searchParams.set('repository', repositoryFromDoc(doc))
    url.searchParams.set('commit', commitFromDoc(doc))

    const response = await fetch(url.href, {
        method: 'POST',
        headers: new Headers({
            'content-type': 'application/json',
            'x-requested-with': 'Basic code intel',
        }),
        body: JSON.stringify({
            method,
            path,
            position,
        }),
    })
    if (!response.ok) {
        throw new Error(`LSIF /request returned ${response.statusText}`)
    }
    return await response.json()
}

function setPath(doc: sourcegraph.TextDocument, path: string): string {
    if (path.startsWith('git://')) {
        return path
    }

    const url = new URL(doc.uri)
    url.hash = path
    return url.href
}
