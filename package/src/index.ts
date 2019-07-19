import * as sourcegraph from 'sourcegraph'
import { Handler, HandlerArgs, documentSelector } from './handler'
import * as LSP from 'vscode-languageserver-types'
import { convertLocations, convertHover } from './lsp-conversion'

export { Handler, HandlerArgs, registerFeedbackButton } from './handler'

// No-op for Sourcegraph versions prior to 3.0-preview
const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activateBasicCodeIntel(
    args: HandlerArgs
): (ctx: sourcegraph.ExtensionContext) => void {
    return function activate(
        ctx: sourcegraph.ExtensionContext = DUMMY_CTX
    ): void {
        const h = new Handler({ ...args, sourcegraph })

        sourcegraph.internal.updateContext({ isImprecise: true })

        ctx.subscriptions.add(
            sourcegraph.languages.registerHoverProvider(
                documentSelector(h.fileExts),
                {
                    provideHover: async (doc, pos) =>
                        (await hasLSIF(doc))
                            ? await lsif.provideHover(doc, pos)
                            : await h.hover(doc, pos),
                }
            )
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(
                documentSelector(h.fileExts),
                {
                    provideDefinition: async (doc, pos) =>
                        (await hasLSIF(doc))
                            ? await lsif.provideDefinition(doc, pos)
                            : await h.definition(doc, pos),
                }
            )
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerReferenceProvider(
                documentSelector(h.fileExts),
                {
                    provideReferences: async (doc, pos) =>
                        (await hasLSIF(doc))
                            ? await lsif.provideReferences(doc, pos)
                            : await h.references(doc, pos),
                }
            )
        )
    }
}

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

async function send({
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
            'x-requested-with': 'Sourcegraph LSIF extension',
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

const lsifDocs = new Map<string, Promise<boolean>>()

async function hasLSIF(doc: sourcegraph.TextDocument): Promise<boolean> {
    if (lsifDocs.has(doc.uri)) {
        return lsifDocs.get(doc.uri)!
    }

    const url = new URL('.api/lsif/exists', sourcegraph.internal.sourcegraphURL)
    url.searchParams.set('repository', repositoryFromDoc(doc))
    url.searchParams.set('commit', commitFromDoc(doc))
    url.searchParams.set('file', pathFromDoc(doc))

    const hasLSIFPromise = (async () => {
        const response = await fetch(url.href, {
            method: 'POST',
            headers: new Headers({
                'x-requested-with': 'Sourcegraph LSIF extension',
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

const lsif = {
    provideHover: async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Hover | null> => {
        console.log('lsifhover')
        const hover: LSP.Hover | null = await send({
            doc,
            method: 'hover',
            path: pathFromDoc(doc),
            position,
        })
        if (!hover) {
            return null
        }
        return convertHover(sourcegraph, hover)
    },

    provideDefinition: async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Definition | null> => {
        const body: LSP.Location | LSP.Location[] | null = await send({
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
    },
    provideReferences: async (
        doc: sourcegraph.TextDocument,
        position: sourcegraph.Position
    ): Promise<sourcegraph.Location[] | null> => {
        const locations: LSP.Location[] | null = await send({
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
    },
}
