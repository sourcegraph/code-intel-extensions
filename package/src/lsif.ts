import * as sourcegraph from 'sourcegraph'
import * as LSP from 'vscode-languageserver-types'
import { convertLocations, convertHover } from './lsp-conversion'
import { queryGraphQL } from './api'

function repositoryFromDoc(doc: sourcegraph.TextDocument): string {
    const url = new URL(doc.uri)
    return url.hostname + url.pathname
}

function commitFromDoc(doc: sourcegraph.TextDocument): string {
    const url = new URL(doc.uri)
    return url.search.slice(1)
}

function pathFromDoc(doc: sourcegraph.TextDocument): string {
    const url = new URL(doc.uri)
    return url.hash.slice(1)
}

function setPath(doc: sourcegraph.TextDocument, path: string): string {
    const url = new URL(doc.uri)
    url.hash = path
    return url.href
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

export const mkIsLSIFAvailable = (lsifDocs: Map<string, Promise<boolean>>) => (
    doc: sourcegraph.TextDocument,
    pos: sourcegraph.Position
): Promise<boolean> => {
    if (!sourcegraph.configuration.get().get('codeIntel.lsif')) {
        return Promise.resolve(false)
    }

    if (lsifDocs.has(doc.uri)) {
        return lsifDocs.get(doc.uri)!
    }

    const url = new URL('.api/lsif/exists', sourcegraph.internal.sourcegraphURL)
    url.searchParams.set('repository', repositoryFromDoc(doc))
    url.searchParams.set('commit', commitFromDoc(doc))
    url.searchParams.set('file', pathFromDoc(doc))

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
            throw new Error(`LSIF /exists returned ${response.statusText}`)
        }
        return await response.json()
    })()

    lsifDocs.set(doc.uri, hasLSIFPromise)

    return hasLSIFPromise
}

async function hover(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Hover | null> {
    const hover: LSP.Hover | null = await queryLSIF({
        doc,
        method: 'hover',
        path: pathFromDoc(doc),
        position,
    })
    if (!hover) {
        return null
    }
    return convertHover(sourcegraph, hover)
}

async function definition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Definition | null> {
    const body: LSP.Location | LSP.Location[] | null = await queryLSIF({
        doc,
        method: 'definitions',
        path: pathFromDoc(doc),
        position,
    })
    if (!body) {
        return null
    }
    const locations = Array.isArray(body) ? body : [body]
    return convertLocations(
        sourcegraph,
        locations.map((definition: LSP.Location) => ({
            ...definition,
            uri: setPath(doc, definition.uri),
        }))
    )
}

async function references(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Location[] | null> {
    const locations: LSP.Location[] | null = await queryLSIF({
        doc,
        method: 'references',
        path: pathFromDoc(doc),
        position,
    })
    if (!locations) {
        return []
    }
    return convertLocations(
        sourcegraph,
        locations.map((reference: LSP.Location) => ({
            ...reference,
            uri: setPath(doc, reference.uri),
        }))
    )
}

export type Maybe<T> = { value: T } | undefined

export const wrapMaybe = <A extends any[], R>(
    f: (...args: A) => Promise<R>
) => async (...args: A): Promise<Maybe<R>> => {
    const r = await f(...args)
    return r !== undefined ? { value: r } : undefined
}

export function asyncWhen<A extends any[], R>(
    asyncPredicate: (...args: A) => Promise<boolean>
): (f: (...args: A) => Promise<R>) => (...args: A) => Promise<Maybe<R>> {
    return f => async (...args) =>
        (await asyncPredicate(...args))
            ? { value: await f(...args) }
            : undefined
}

export function when<A extends any[], R>(
    predicate: (...args: A) => boolean
): (f: (...args: A) => Promise<R>) => (...args: A) => Promise<Maybe<R>> {
    return f => async (...args) =>
        predicate(...args) ? { value: await f(...args) } : undefined
}

export const asyncFirst = <A extends any[], R>(
    fs: ((...args: A) => Promise<Maybe<R>>)[],
    defaultR: R
) => async (...args: A): Promise<R> => {
    for (const f of fs) {
        const r = await f(...args)
        if (r !== undefined) {
            return r.value
        }
    }
    return defaultR
}

export function initLSIF() {
    const lsifDocs = new Map<string, Promise<boolean>>()

    const isLSIFAvailable = mkIsLSIFAvailable(lsifDocs)

    return {
        hover: asyncWhen<
            [sourcegraph.TextDocument, sourcegraph.Position],
            sourcegraph.Hover | null
        >(isLSIFAvailable)(hover),
        definition: asyncWhen<
            [sourcegraph.TextDocument, sourcegraph.Position],
            sourcegraph.Definition | null
        >(isLSIFAvailable)(definition),
        references: asyncWhen<
            [sourcegraph.TextDocument, sourcegraph.Position],
            sourcegraph.Location[] | null
        >(isLSIFAvailable)(references),
    }
}
