import { API } from '../../../shared/util/api'
import { fetch } from '../../../shared/util/fetch'
import { isDefined, safePromise, sortUnique } from '../../../shared/util/helpers'

export interface Response {
    results: {
        path: string
    }[]
}

/**
 * Return a set of resolved repository names that import the given import
 * path by querying a godoc.org-compatible API.
 *
 * @param gddoURL The URL of the GDDO API.
 * @param corsAnywhereURL The URL of the CORS proxy.
 * @param importPath The import path to query.
 * @param limit The maximum number of results to return.
 * @param fetcher A mock HTTP fetch function.
 * @param api The GraphQL API instance.
 */
export async function findReposViaGDDO(
    gddoURL: string,
    corsAnywhereURL: string | undefined,
    importPath: string,
    limit: number,
    fetcher: (url: URL) => Promise<Response> = fetch,
    api: API = new API()
): Promise<string[]> {
    const importersURL = new URL(gddoURL)
    importersURL.pathname = `importers/${importPath}`
    const url = new URL((corsAnywhereURL || '') + importersURL.href)

    return sortUnique(
        (
            await Promise.all(
                (await fetcher(url)).results
                    .map(({ path }) => path)
                    .map(transformGithubCloneURL)
                    .filter(isDefined)
                    .slice(0, limit)
                    .map(safePromise(api.resolveRepo.bind(api)))
            )
        ).map(meta => meta?.name)
    ).filter(isDefined)
}

/**
 * Trim everything after the project name in a GitHub project path.
 *
 * @param path A GitHub project path.
 */
function transformGithubCloneURL(path: string): string | undefined {
    if (path.startsWith('github.com/')) {
        return path.split('/').slice(0, 3).join('/')
    }

    return undefined
}
