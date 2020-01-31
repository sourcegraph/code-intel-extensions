import { definitionFeature } from './definition'
import { hoverFeature } from './hover'
import { referencesFeature } from './references'

export const features = {
    [definitionFeature.requestType.method]: definitionFeature,
    [referencesFeature.requestType.method]: referencesFeature,
    [hoverFeature.requestType.method]: hoverFeature,
}
