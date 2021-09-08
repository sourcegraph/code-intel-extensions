/**
 * Return a new URL by replacing its hash.
 *
 * @param url The base URL.
 * @param hash The new hash.
 */
export function withHash(url: URL, hash: string): URL {
    const root = new URL(url.href)
    root.hash = hash
    return root
}

/**
 * Return a new URL by removing its hash.
 *
 * @param url The base URL.
 */
export function removeHash(url: URL): URL {
    return withHash(url, '')
}

/**
 * Converts a Git URL into a raw API URL.
 *
 * @param sourcegraphURL The Sourcegraph server URL.
 * @param accessToken An optional access token.
 * @param uri The URI to transform.
 */
export function gitToRawApiUri(sourcegraphURL: URL, accessToken: string | undefined, uri: URL): URL {
    if (uri.protocol !== 'git:') {
        throw new Error(`Not a Sourcegraph git:// URI: ${uri.href}`)
    }

    const rootUri = new URL(sourcegraphURL.href)
    if (accessToken) {
        rootUri.username = accessToken
    }
    const revision = uri.search.length > 1 ? '@' + uri.search.slice(1) : ''
    rootUri.pathname = `${uri.host}${uri.pathname}${revision}/-/raw/`
    return new URL(uri.hash.slice(1), rootUri.href)
}

/**
 * Converts a raw API URL into a Git URL.
 *
 * @param rawApiUrl The URL to transform.
 */
export function rawApiToGitUri(rawApiUrl: URL): URL {
    const match = rawApiUrl.pathname.match(/^\/([^@]+)(?:@([^/]+))?\/-\/raw\/(.*)$/)
    if (!match) {
        throw new Error(`Not a Sourcegraph raw API URL: ${rawApiUrl.href}`)
    }

    const [, repoName, revision, filePath] = match as [string, string, string | undefined, string]

    const gitUri = new URL(`git://${repoName}`)
    gitUri.search = revision || ''
    gitUri.hash = filePath
    return gitUri
}

/**
 * Extracts the components of a text document URI.
 *
 * @param url The text document URL.
 */
export function parseGitURI({ hostname, pathname, search, hash }: URL): { repo: string; commit: string; path: string } {
    return {
        repo: hostname + decodeURIComponent(pathname),
        commit: decodeURIComponent(search.slice(1)),
        path: decodeURIComponent(hash.slice(1)),
    }
}
