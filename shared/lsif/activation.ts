import * as sourcegraph from 'sourcegraph'
import { initGraphQL } from './graphql'
import { initHTTP } from './http'
import { queryGraphQL } from '../graphql'
import { compareVersion } from '../versions'
import { LSIFProviders } from './providers'

/**
 * The date that the LSIF GraphQL API resolvers became available.
 *
 * Specifically, ensure that the commit 34e6a67ecca30afb4a5d8d200fc88a724d3c4ac5
 * exists, as there is a bad performance issue prior to that when a force push
 * removes commits from the codehost for which we have LSIF data.
 */
const GRAPHQL_API_MINIMUM_DATE = '2020-01-08'

/** The version that the LSIF GraphQL API resolvers became available. */
const GRAPHQL_API_MINIMUM_VERSION = '3.12.0'

export function initLSIF(): LSIFProviders {
    const provider = createProvider()

    return {
        // If graphQL is supported, use the GraphQL implementation.
        // Otherwise, use the legacy HTTP implementation.
        definition: async (...args) => (await provider).definition(...args),
        references: async (...args) => (await provider).references(...args),
        hover: async (...args) => (await provider).hover(...args),
    }
}

async function createProvider(): Promise<LSIFProviders> {
    if (await supportsGraphQL()) {
        console.log('Sourcegraph instance supports LSIF GraphQL API')
        return initGraphQL()
    }
    console.log(
        'Sourcegraph instance does not support LSIF GraphQL API, falling back to HTTP API'
    )
    return initHTTP()
}

async function supportsGraphQL(): Promise<boolean> {
    const query = `
        query SiteVersion {
            site {
                productVersion
            }
        }
    `

    const respObj = await queryGraphQL({
        query,
        vars: {},
        sourcegraph,
    })

    return compareVersion({
        productVersion: respObj.data.site.productVersion,
        minimumVersion: GRAPHQL_API_MINIMUM_VERSION,
        minimumDate: GRAPHQL_API_MINIMUM_DATE,
    })
}
