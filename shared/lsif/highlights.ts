import * as sourcegraph from 'sourcegraph'
import { isDefined } from '../util/helpers'

export function filterLocationsForDocumentHighlights(
    doc: sourcegraph.TextDocument,
    locations: sourcegraph.Location[]
): sourcegraph.DocumentHighlight[] {
    return locations
        .filter(({ uri }) => uri.toString() === doc.uri)
        .map(({ range }) => range)
        .filter(isDefined)
        .map(range => ({ range }))
}
