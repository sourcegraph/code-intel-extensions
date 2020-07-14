import { API } from '../../../shared/util/api'
import { fetch } from '../../../shared/util/fetch'
import { safePromise } from '../../../shared/util/helpers'

export interface PackageJson {
    name: string
    repository?: string | { url: string }
}

/**
 * Resolve a repository name from the repository in the manifest.
 *
 * @param rawManifest The unparsed manifest.
 * @param api The GraphQL API instance.
 */
export async function resolvePackageRepo(rawManifest: string, api: API = new API()): Promise<string | undefined> {
    const packageJson: PackageJson = JSON.parse(rawManifest)
    if (!packageJson.repository) {
        return Promise.resolve(undefined)
    }

    return (
        await safePromise(api.resolveRepo.bind(api))(
            typeof packageJson.repository === 'string' ? packageJson.repository : packageJson.repository.url
        )
    )?.name
}

function definitelyTypedPackageName(uri: URL): string | undefined {
    if (uri.pathname.includes('DefinitelyTyped/DefinitelyTyped')) {
        const dtMatch = uri.pathname.match(/\/types\/([^/]+)\//)
        if (dtMatch) {
            return '@types/' + dtMatch[1]
        }
    }

    return undefined
}

function vscodePackageName(uri: URL): string | undefined {
    return uri.pathname.endsWith('/vscode.d.ts') ? 'vscode' : undefined
}

const packageNameSpecialCases: ((urI: URL) => string | undefined)[] = [definitelyTypedPackageName, vscodePackageName]

/**
 * Find the name of the package by reading the closest package.json to the
 * given file. Will throw an error if no package.json file cna be read from
 * any parent directory, or if the Sourcegraph raw API returns a non-200,
 * non-404 response.
 *
 * @param uri The Sourcegraph raw API URI of the target file.
 */
export async function findPackageName(
    uri: URL,
    fetcher: (url: URL, headers?: Record<string, string>) => Promise<PackageJson> = fetch
): Promise<string> {
    for (const specialCase of packageNameSpecialCases) {
        const packageName = specialCase(uri)
        if (packageName) {
            return packageName
        }
    }

    const current = new URL(uri.href)
    const rootUri = new URL(uri.href)
    rootUri.pathname = ''

    const headers: Record<string, string> = {}
    if (current.username) {
        headers.Authorization = 'token ' + current.username
    }
    current.username = ''
    rootUri.username = ''

    while (current.href !== rootUri.href) {
        try {
            const url = new URL('package.json', current.href)
            const { name } = await fetcher(url, headers)
            return name
        } catch (err) {
            if (err && err.code === 404) {
                current.pathname = new URL('..', current.href).pathname
                continue
            }

            throw err
        }
    }

    throw new Error(`No package.json found for ${uri.href} under root ${rootUri.href}`)
}
