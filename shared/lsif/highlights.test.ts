import * as assert from 'assert'
import { range1, range2, range3, range4, doc } from './util.test'
import { filterLocationsForDocumentHighlights } from './highlights'

describe('filterLocationsForDocumentHighlights', () => {
    it('should filter out distinct paths', async () => {
        assert.deepStrictEqual(
            filterLocationsForDocumentHighlights(doc, [
                { uri: new URL(doc.uri), range: range1 },
                { uri: new URL(doc.uri + '_distinct'), range: range2 },
                { uri: new URL(doc.uri + '_distinct'), range: range3 },
                { uri: new URL(doc.uri), range: range4 },
                { uri: new URL(doc.uri) },
            ]),
            [{ range: range1 }, { range: range4 }]
        )
    })
})
