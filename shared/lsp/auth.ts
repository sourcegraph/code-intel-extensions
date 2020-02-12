import * as sourcegraph from 'sourcegraph'
import { createAccessToken, getUser } from '../util/api'

let accessTokenPromise: Promise<string | undefined> | undefined

/**
 * Get or create an access token. This will first try to read the current
 * user configuration and return that. If no access token is supplied, one
 * will be created and put into the settings. This may fail if the user is
 * not authenticated or the access token creation fails.
 *
 * This method method ensures that only a single access token is created
 * for the lifetime of the extension.
 *
 * @param name The name of the configuration setting with an access token.
 * @param note A note to tag to a newly created access token.
 */
export async function getOrCreateAccessToken(
    name: string,
    note: string
): Promise<string | undefined> {
    const accessToken = sourcegraph.configuration.get().get(name) as
        | string
        | undefined
    if (accessToken) {
        return accessToken
    }
    if (!accessTokenPromise) {
        accessTokenPromise = (async (): Promise<string | undefined> => {
            const userId = await getUser()
            if (!userId) {
                return undefined
            }

            const token = await createAccessToken(userId, note)
            await sourcegraph.configuration.get().update(name, token)
            return token
        })()
    }
    return accessTokenPromise
}
