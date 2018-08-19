/**
 * Configuration for this extension.
 */
export interface Config {
    sourcegraphToken: string
    definition: {
        symbols: 'no' | 'local' | 'yes'
    },
    debug: {
        traceSearch: boolean,
    }
}

/**
 * authToken is the access token used to authenticate to the Sourcegraph API. This will be set in the
 * initialize handler.
 */
export let config: Config;

export function updateConfig(newConfig: Config) {
    config = newConfig
}