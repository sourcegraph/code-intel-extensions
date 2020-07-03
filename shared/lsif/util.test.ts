import * as sourcegraph from 'sourcegraph'
import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import { GenericLSIFResponse } from './api'

export const doc = createStubTextDocument({
    uri: 'https://sourcegraph.test/repo@rev/-/raw/foo.ts',
    languageId: 'typescript',
    text: undefined,
})

export const makeResource = (name: string, oid: string, path: string) => ({
    repository: { name },
    commit: { oid },
    path,
})

export const pos = new sourcegraph.Position(5, 10)
export const range1 = new sourcegraph.Range(1, 2, 3, 4)
export const range2 = new sourcegraph.Range(2, 3, 4, 5)
export const range3 = new sourcegraph.Range(3, 4, 5, 6)

export const resource1 = makeResource('repo1', 'deadbeef1', '/a.ts')
export const resource2 = makeResource('repo2', 'deadbeef2', '/b.ts')
export const resource3 = makeResource('repo3', 'deadbeef3', '/c.ts')

export const makeEnvelope = <R>(
    value: R | null = null
): Promise<GenericLSIFResponse<R | null>> =>
    Promise.resolve({
        repository: {
            commit: {
                blob: {
                    lsif: value,
                },
            },
        },
    })

export async function gatherValues<T>(g: AsyncGenerator<T>): Promise<T[]> {
    const values: T[] = []
    for await (const v of g) {
        values.push(v)
    }
    return values
}
