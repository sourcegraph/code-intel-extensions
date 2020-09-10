import * as sourcegraph from 'sourcegraph'
import { BasicCodeIntelligenceSettings } from './settings'

/** Retrieves a config value by key. */
export function getConfig<T>(key: string, defaultValue: T): T {
    return (sourcegraph.configuration.get<BasicCodeIntelligenceSettings>().get(key) as T | undefined) || defaultValue
}
