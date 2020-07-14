import * as sourcegraph from 'sourcegraph'

type GraphQLResponse<T> = GraphQLResponseSuccess<T> | GraphQLResponseError

interface GraphQLResponseSuccess<T> {
    data: T
    errors: undefined
}

interface GraphQLResponseError {
    data: undefined
    errors: Error[]
}

/** The generic type of the queryGraphQL function. */
export type QueryGraphQLFn<T> = (query: string, vars?: { [name: string]: unknown }) => Promise<T>

/**
 * Perform a GraphQL query via the extension host.
 *
 * @param query The GraphQL query string.
 * @param vars The query variables.
 */
export async function queryGraphQL<T>(query: string, vars: { [name: string]: unknown } = {}): Promise<T> {
    const resp = await sourcegraph.commands.executeCommand<GraphQLResponse<T>>('queryGraphQL', query, vars)

    if (resp.errors !== undefined) {
        throw resp.errors.length === 1 ? resp.errors[0] : aggregateErrors(resp.errors)
    }

    return resp.data
}

function aggregateErrors(errors: Error[]): Error {
    return Object.assign(new Error(errors.map(e => e.message).join('\n')), {
        name: 'AggregateError',
        errors,
    })
}
