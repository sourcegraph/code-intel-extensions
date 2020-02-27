import * as assert from 'assert'
import { scopeDocumentSelectorToRoot } from './registration'

describe('scopeDocumentSelectorToRoot()', () => {
    it('builds selectors from clientRootUri', () => {
        assert.deepStrictEqual(
            scopeDocumentSelectorToRoot(
                ['l'],
                new URL(
                    'git://github.com/gorilla/mux?d83b6ffe499a29cc05fc977988d0392851779620'
                )
            ),
            [
                {
                    language: 'l',
                    pattern:
                        'git://github.com/gorilla/mux?d83b6ffe499a29cc05fc977988d0392851779620#**/**',
                },
            ]
        )
    })
    it('builds selectors from clientRootUri and pattern', () => {
        assert.deepStrictEqual(
            scopeDocumentSelectorToRoot(
                [{ pattern: '*.go' }],
                new URL(
                    'git://github.com/gorilla/mux?d83b6ffe499a29cc05fc977988d0392851779620'
                )
            ),
            [
                {
                    pattern:
                        'git://github.com/gorilla/mux?d83b6ffe499a29cc05fc977988d0392851779620#*.go',
                },
            ]
        )
    })
})
