/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export interface Settings {
    /**
     * Whether to use pre-computed LSIF data for code intelligence (such as hovers, definitions, and references). See https://docs.sourcegraph.com/code_intelligence/explanations/precise_code_intelligence.
     */
    'codeIntel.lsif'?: boolean
    /**
     * Whether to enable trace logging on the extension.
     */
    'codeIntel.traceExtension'?: boolean
    /**
     * Whether to fetch multiple precise definitions and references on hover.
     */
    'codeIntel.disableRangeQueries'?: boolean
    /**
     * Whether to supplement precise references with search-based results.
     */
    'codeIntel.mixPreciseAndSearchBasedReferences'?: boolean
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
    /**
     * The address of the WebSocket language server to connect to (e.g. ws://host:4389).
     */
    'go.serverUrl'?: string
    /**
     * The address of the Sourcegraph instance from the perspective of the Go language server.
     */
    'go.sourcegraphUrl'?: string
    /**
     * The access token for the language server to use to fetch files from the Sourcegraph API. The extension will create this token and save it in your settings automatically.
     */
    'go.accessToken'?: string
    /**
     * Whether or not a second references provider for external references will be registered (defaults to false).
     */
    'go.showExternalReferences'?: boolean
    /**
     * The maximum number of repositories to look in when searching for external references for a symbol (defaults to 20).
     */
    'go.maxExternalReferenceRepos'?: number
    /**
     * The address to Go Doc Dot Org or a proxy that speaks the same API (only used on Sourcegraph.com).
     */
    'go.gddoURL'?: string
    /**
     * Address of a cors-anywhere service. This will cause the extension to send GDDO requests to this service instead of directly to api.godoc.org. For example: https://cors-anywhere.sourcegraph.com/https://api.godoc.org/importersgithub.com/sourcegraph/go-lsp. This would not be necessary if godoc.org set CORS headers.
     */
    'go.corsAnywhereURL'?: string
}
