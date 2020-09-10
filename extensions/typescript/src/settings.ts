/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export interface Settings {
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
    /**
     * The address of the WebSocket language server to connect to (e.g. ws://host:8080).
     */
    'typescript.serverUrl'?: string
    /**
     * The address of the Sourcegraph instance from the perspective of the TypeScript language server.
     */
    'typescript.sourcegraphUrl'?: string
    /**
     * The access token for the language server to use to fetch files from the Sourcegraph API. The extension will create this token and save it in your settings automatically.
     */
    'typescript.accessToken'?: string
    /**
     * Whether or not a second references provider for external references will be registered (defaults to false).
     */
    'typescript.showExternalReferences'?: boolean
    /**
     * The maximum number of dependent packages to look in when searching for external references for a symbol (defaults to 20).
     */
    'typescript.maxExternalReferenceRepos'?: number
    /**
     * Whether to report progress while fetching sources, installing dependencies etc. (Default: true)
     */
    'typescript.progress'?: boolean
    /**
     * Whether to show compile errors on lines (Default: false)
     */
    'typescript.diagnostics.enable'?: boolean
    /**
     * Settings to be written into an npmrc in key/value format. Can be used to specify custom registries and tokens.
     */
    'typescript.npmrc'?: {
        [k: string]: any
    }
    /**
     * Whether to restart the language server after dependencies were installed (default true)
     */
    'typescript.restartAfterDependencyInstallation'?: boolean
    /**
     * The log level to pass to the TypeScript language server. Logs will be forwarded to the browser console with the prefix [langserver].
     */
    'typescript.langserver.log'?: false | 'log' | 'info' | 'warn' | 'error'
    /**
     * The log level to pass to tsserver. Logs will be forwarded to the browser console with the prefix [tsserver].
     */
    'typescript.tsserver.log'?: false | 'terse' | 'normal' | 'requestTime' | 'verbose'
}
