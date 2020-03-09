import * as sourcegraph from 'sourcegraph'
import { Logger } from '../logging'
import { noopProviders, Providers } from '../providers'
import { API } from '../util/api'
import { compareVersion } from '../util/versions'
import { createProviders as createGraphQLProviders } from './graphql'
import { createProviders as createHTTPProviders } from './http'

/**
 * The date that the LSIF GraphQL API resolvers became available.
 *
 * Specifically, ensure that the commit 34e6a67ecca30afb4a5d8d200fc88a724d3c4ac5
 * exists, as there is a bad performance issue prior to that when a force push
 * removes commits from the codehost for which we have LSIF data.
 */
const GRAPHQL_API_MINIMUM_DATE = '2020-01-08'

/**
 * The version that the LSIF GraphQL API resolvers became available.
 */
const GRAPHQL_API_MINIMUM_VERSION = '3.12.0'

/**
 * Creates providers powered by LSIF-based code intelligence.
 */
export function createProviders(logger: Logger): Providers {
    const enabled = !!sourcegraph.configuration.get().get('codeIntel.lsif')
    if (!enabled) {
        logger.log('LSIF is not enabled in global settings')
        return noopProviders
    }

    const provider = selectProvider(logger)

    async function* definition(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Definition, void, undefined> {
        yield* (await provider).definition(doc, pos)
    }

    async function* references(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        ctx: sourcegraph.ReferenceContext
    ): AsyncGenerator<sourcegraph.Location[] | null, void, undefined> {
        yield* (await provider).references(doc, pos, ctx)
    }

    async function* hover(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): AsyncGenerator<sourcegraph.Hover | null, void, undefined> {
        yield* (await provider).hover(doc, pos)
    }

    return {
        definition,
        references,
        hover,
    }
}

/**
 * Return the GraphQL LSIF providers if the Sourcegraph instance supports it.
 * Otherwise, use the HTTP API providers.
 *
 * @param logger The logger instance.
 * @param api The GraphQL API instance.
 */
async function selectProvider(logger: Logger, api:API = new API()): Promise<Providers> {
    const supportsGraphQL = compareVersion({
        productVersion: await api.productVersion(),
        minimumVersion: GRAPHQL_API_MINIMUM_VERSION,
        minimumDate: GRAPHQL_API_MINIMUM_DATE,
    })

    if (supportsGraphQL) {
        logger.log('Sourcegraph instance supports LSIF GraphQL API')
        return createGraphQLProviders()
    }

    logger.log(
        'Sourcegraph instance does not support LSIF GraphQL API, falling back to HTTP API'
    )
    return createHTTPProviders()
}
