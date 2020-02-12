/**
 * Perform an HTTP request. Returns the JSON response body. Throws an error if
 * the response status is not 2xx.
 *
 * @param url The URL to fetch.
 * @param headers Optional request headers.
 */
export async function fetch<T>(
    url: URL,
    headers?: Record<string, string>
): Promise<T> {
    const response = await self.fetch(url.href, { headers })
    if (!response.ok) {
        throw Object.assign(
            new Error(`Unexpected ${response.status} status from API`),
            {
                code: response.status,
            }
        )
    }

    return response.json()
}
