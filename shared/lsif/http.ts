import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { convertHover, convertLocations } from '../lsp/conversion'
import { Providers } from '../providers'
import { getUser } from '../util/api'
import { mapArrayish } from '../util/helpers'
import { asyncGeneratorFromPromise } from '../util/ix'
import { parseGitURI, withHash } from '../util/uri'

/**
 * Creates providers powered by LSIF-based code intelligence. This particular
 * set of providers will use the legacy LSIF HTTP API.
 */
export function createProviders(): Providers {
    const lsifDocs = new Map<string, Promise<boolean>>()

    const ensureExists = <T>(
        fn: (
            doc: sourcegraph.TextDocument,
            pos: sourcegraph.Position
        ) => Promise<T>
    ): ((
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => AsyncGenerator<T | null, void, undefined>) =>
        asyncGeneratorFromPromise(async (doc, pos) => {
            let hasLSIFPromise = lsifDocs.get(doc.uri)
            if (!hasLSIFPromise) {
                hasLSIFPromise = exists(parseGitURI(new URL(doc.uri)))
                lsifDocs.set(doc.uri, hasLSIFPromise)
            }

            if (await hasLSIFPromise) {
                return fn(doc, pos)
            }

            return null
        })

    return {
        definition: ensureExists(definition),
        references: ensureExists(references),
        hover: ensureExists(hover),
    }
}

/**
 * Determines if there is LSIF data for a repo, commit, and path.
 *
 * @param args Parameter bag.
 */
async function exists({
    repo,
    commit,
    path,
}: {
    /** The repository name. */
    repo: string
    /** The commit. */
    commit: string
    /** The path of the file. */
    path: string
}): Promise<boolean> {
    try {
        // Make ANY GraphQL request and rely on the Sourcegraph extension
        // host to throw an error when in the context of a private repository.
        // We want to do this to prevent leaking the name of a private repo.
        await getUser()
    } catch (e) {
        return false
    }

    const url = new URL('.api/lsif/exists', sourcegraph.internal.sourcegraphURL)
    url.searchParams.set('repository', repo)
    url.searchParams.set('commit', commit)
    url.searchParams.set('file', path)

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
}

/**
 * Retrieve a definition for the current hover position.
 *
 * @param doc The current text document.
 * @param position The current hover position.
 */
async function definition(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Definition> {
    const { path } = parseGitURI(new URL(doc.uri))

    return convertLocations(
        mapArrayish(
            await queryLSIF<lsp.Location | lsp.Location[] | null>({
                doc,
                position,
                path,
                method: 'definitions',
            }),
            d => ({ ...d, uri: setPath(doc, d.uri) })
        )
    )
}

/**
 * Retrieve references for the current hover position.
 *
 * @param doc The current text document.
 * @param position The current hover position.
 */
async function references(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Location[] | null> {
    const { path } = parseGitURI(new URL(doc.uri))

    return convertLocations(
        mapArrayish(
            await queryLSIF<lsp.Location[] | null>({
                doc,
                position,
                path,
                method: 'references',
            }),
            r => ({ ...r, uri: setPath(doc, r.uri) })
        )
    )
}

/**
 * Retrieve hover text for the current hover position.
 *
 * @param doc The current text document.
 * @param position The current hover position.
 */
async function hover(
    doc: sourcegraph.TextDocument,
    position: sourcegraph.Position
): Promise<sourcegraph.Hover | null> {
    const { path } = parseGitURI(new URL(doc.uri))

    return convertHover(
        await queryLSIF<lsp.Hover | null>({
            doc,
            position,
            path,
            method: 'hover',
        })
    )
}

/**
 * Perform a request to the LSIF HTTP API.
 *
 * @param args Parameter bag.
 */
async function queryLSIF<T>({
    doc,
    position,
    path,
    method,
}: {
    /** The current text document. */
    doc: sourcegraph.TextDocument
    /** The current hover position. */
    position: lsp.Position
    /** The path of the file. */
    path: string
    /** The LSIF method type. */
    method: string
}): Promise<T> {
    const { repo, commit } = parseGitURI(new URL(doc.uri))

    const url = new URL(
        '.api/lsif/request',
        sourcegraph.internal.sourcegraphURL
    )
    url.searchParams.set('repository', repo)
    url.searchParams.set('commit', commit)

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
    return response.json()
}

/**
 * If the path is a remote file, return it unchanged. Otherwise, create a
 * new path from the current text document URI and the given file path. This
 * is used to create paths to another file in the same repository and commit.
 *
 * @param doc The current text document.
 * @param path The path of the file.
 */
function setPath(doc: sourcegraph.TextDocument, path: string): string {
    return path.startsWith('git://')
        ? path
        : withHash(new URL(doc.uri), path).href
}
