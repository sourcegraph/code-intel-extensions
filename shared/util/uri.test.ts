import * as assert from 'assert'
import { gitToRawApiUri, parseGitURI, rawApiToGitUri } from './uri'

describe('gitToRawApiUri', () => {
    it('converts URL', () => {
        assert.deepStrictEqual(
            gitToRawApiUri(
                new URL('https://sourcegraph.com'),
                '',
                new URL(
                    'git://github.com/sourcegraph/extensions-client-common?80389224bd48e1e696d5fa11b3ec6fba341c695b#src/schema/graphqlschema.ts'
                )
            ).href,
            'https://sourcegraph.com/github.com/sourcegraph/extensions-client-common@80389224bd48e1e696d5fa11b3ec6fba341c695b/-/raw/src/schema/graphqlschema.ts'
        )
    })

    it('converts URL with access token', () => {
        assert.deepStrictEqual(
            gitToRawApiUri(
                new URL('https://sourcegraph.com'),
                'deadbeef',
                new URL(
                    'git://github.com/sourcegraph/extensions-client-common?80389224bd48e1e696d5fa11b3ec6fba341c695b#src/schema/graphqlschema.ts'
                )
            ).href,
            'https://deadbeef@sourcegraph.com/github.com/sourcegraph/extensions-client-common@80389224bd48e1e696d5fa11b3ec6fba341c695b/-/raw/src/schema/graphqlschema.ts'
        )
    })
})

describe('rawApiToGitUri', () => {
    it('converts URL', () => {
        assert.deepStrictEqual(
            rawApiToGitUri(
                new URL(
                    'https://sourcegraph.com/github.com/sourcegraph/extensions-client-common@80389224bd48e1e696d5fa11b3ec6fba341c695b/-/raw/src/schema/graphqlschema.ts'
                )
            ).href,
            'git://github.com/sourcegraph/extensions-client-common?80389224bd48e1e696d5fa11b3ec6fba341c695b#src/schema/graphqlschema.ts'
        )
    })

    it('converts URL without commit', () => {
        assert.deepStrictEqual(
            rawApiToGitUri(
                new URL(
                    'https://sourcegraph.com/github.com/sourcegraph/extensions-client-common/-/raw/src/schema/graphqlschema.ts'
                )
            ).href,
            'git://github.com/sourcegraph/extensions-client-common#src/schema/graphqlschema.ts'
        )
    })
})

describe('parseGitURI', () => {
    it('returns components', () => {
        assert.deepStrictEqual(
            parseGitURI(
                new URL('git://github.com/microsoft/vscode?dbd76d987cf1a412401bdbd3fb785217ac94197e#src/vs/css.js')
            ),
            {
                repo: 'github.com/microsoft/vscode',
                commit: 'dbd76d987cf1a412401bdbd3fb785217ac94197e',
                path: 'src/vs/css.js',
            }
        )
    })

    it('decodes repos with spaces', () => {
        assert.deepStrictEqual(
            parseGitURI(
                new URL(
                    'git://sourcegraph.visualstudio.com/Test%20Repo?dbd76d987cf1a412401bdbd3fb785217ac94197e#src/vs/css.js'
                )
            ),
            {
                repo: 'sourcegraph.visualstudio.com/Test Repo',
                commit: 'dbd76d987cf1a412401bdbd3fb785217ac94197e',
                path: 'src/vs/css.js',
            }
        )
    })
})
