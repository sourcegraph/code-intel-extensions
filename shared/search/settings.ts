/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export interface BasicCodeIntelligenceSettings {
    /**
     * Whether to use pre-computed LSIF data for code intelligence (such as hovers, definitions, and references). See https://docs.sourcegraph.com/user/code_intelligence/lsif.
     */
    'codeIntel.lsif'?: boolean
    /**
     * Whether to fetch multiple precise definitions and references on hover.
     */
    'codeIntel.disableRangeQueries'?: boolean
    /**
     * Whether to include forked repositories in search results.
     */
    'basicCodeIntel.includeForks'?: boolean
    /**
     * Whether to include archived repositories in search results.
     */
    'basicCodeIntel.includeArchives'?: boolean
    /**
     * Whether to use only indexed requests to the search API.
     */
    'basicCodeIntel.indexOnly'?: boolean
    /**
     * The timeout (in milliseconds) for un-indexed search requests.
     */
    'basicCodeIntel.unindexedSearchTimeout'?: number
    [k: string]: any
}
