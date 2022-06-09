import * as sourcegraph from 'sourcegraph'

import { SearchBasedCodeIntelligenceSettings } from './settings'

/** Retrieves a config value by key. */
export function getConfig<K extends keyof SearchBasedCodeIntelligenceSettings, T extends SearchBasedCodeIntelligenceSettings[K]>(key: K, defaultValue: T): T {
    return (
        (sourcegraph.configuration.get<SearchBasedCodeIntelligenceSettings>().get(key) as T | undefined) || defaultValue
    )
}
