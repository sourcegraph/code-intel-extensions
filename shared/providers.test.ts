import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as assert from 'assert'
import { Observable } from 'rxjs'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import * as indicators from './indicators'
import { LSIFSupport } from './language-specs/spec'
import {
    createDefinitionProvider,
    createDocumentHighlightProvider,
    createHoverProvider,
    createReferencesProvider,
    clearReferenceResultCache,
} from './providers'
import { API } from './util/api'

const textDocument = createStubTextDocument({
    uri: 'https://sourcegraph.test/repo@rev/-/raw/foo.ts',
    languageId: 'typescript',
    text: undefined,
})

const position = new sourcegraph.Position(10, 5)
const range1 = new sourcegraph.Range(1, 2, 3, 4)
const range2 = new sourcegraph.Range(5, 6, 7, 8)

const location1 = new sourcegraph.Location(new URL('http://test/1'), range1)
const location2 = new sourcegraph.Location(new URL('http://test/2'), range1)
const location3 = new sourcegraph.Location(new URL('http://test/3'), range1)
const location4 = new sourcegraph.Location(new URL('http://test/4'), range1)
const location5 = new sourcegraph.Location(new URL('http://test/5'), range1)
const location6 = new sourcegraph.Location(new URL('http://test/6'), range1)
const location7 = new sourcegraph.Location(new URL('http://test/2'), range2) // overlapping URI
const location8 = new sourcegraph.Location(new URL('http://test/3'), range2) // overlapping URI
const location9 = new sourcegraph.Location(new URL('http://test/4'), range2) // overlapping URI

const hover1: sourcegraph.Hover = { contents: { value: 'test1' } }
const hover2: sourcegraph.Hover = { contents: { value: 'test2' } }
const hover3: sourcegraph.Hover = { contents: { value: 'test3' } }
const hover4: sourcegraph.Hover = { contents: { value: 'test4' } }

const trimGitHubPrefix = (url: string) =>
    Promise.resolve({
        id: 5,
        name: url.slice('github.com/'.length),
        isFork: false,
        isArchived: false,
    })

const makeStubAPI = (): API => {
    const api = new API()
    const stub = sinon.stub(api, 'resolveRepo')
    stub.callsFake(trimGitHubPrefix)
    return api
}

describe('createDefinitionProvider', () => {
    it('uses LSIF definitions as source of truth', async () => {
        const result = createDefinitionProvider(
            () => Promise.resolve({ definition: [location1, location2], hover: null }),
            () => asyncGeneratorFromValues([location5]),
            () => asyncGeneratorFromValues([location3, location4]),
            undefined,
            undefined,
            undefined,
            makeStubAPI()
        ).provideDefinition(textDocument, position) as Observable<sourcegraph.Definition>

        assert.deepStrictEqual(await gatherValues(result), [
            { ...location1, aggregableBadges: [indicators.semanticBadge] },
            { ...location2, aggregableBadges: [indicators.semanticBadge] },
        ])
    })

    it('falls back to LSP when LSIF results are not found', async () => {
        const result = createDefinitionProvider(
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([location3]),
            () => asyncGeneratorFromValues([location1, location2]),
            undefined,
            undefined,
            undefined,
            makeStubAPI()
        ).provideDefinition(textDocument, position) as Observable<sourcegraph.Definition>

        assert.deepStrictEqual(await gatherValues(result), [location1, location2])
    })

    it('falls back to search when precise results are not found', async () => {
        const result = createDefinitionProvider(
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([location3]),
            undefined,
            undefined,
            undefined,
            undefined,
            makeStubAPI()
        ).provideDefinition(textDocument, position) as Observable<sourcegraph.Definition>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...location3,
                badge: indicators.impreciseBadge,
                aggregableBadges: [indicators.searchBasedBadge],
            },
        ])
    })
})

describe('createReferencesProvider', () => {
    beforeEach(clearReferenceResultCache)

    it('uses LSIF definitions as source of truth', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([]),
            undefined,
            undefined,
            undefined,
            makeStubAPI()
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
            ],
        ])
    })

    it('falls back to LSP when LSIF results are not found', async () => {
        const result = createReferencesProvider(
            () => asyncGeneratorFromValues([]),
            () => asyncGeneratorFromValues([]),
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            undefined,
            undefined,
            makeStubAPI()
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [location1, location2],
            [location1, location2, location3],
        ])
    })

    it('supplements LSIF results with LSP results', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location6]]),
            () => asyncGeneratorFromValues([[location4, location5]]),
            undefined,
            undefined,
            makeStubAPI()
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
                location4,
                location5,
            ],
        ])
    })

    it('supplements LSIF results with search results', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location4]]),
            undefined,
            undefined,
            undefined,
            makeStubAPI(),
            () => true
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
                {
                    ...location4,
                    badge: indicators.impreciseBadge,
                    aggregableBadges: [indicators.searchBasedBadge],
                },
            ],
        ])
    })

    it('supplements LSIF results with non-overlapping search results', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location4], [location4, location7, location8, location9]]),
            undefined,
            undefined,
            undefined,
            makeStubAPI(),
            () => true
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
                {
                    ...location4,
                    badge: indicators.impreciseBadge,
                    aggregableBadges: [indicators.searchBasedBadge],
                },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
                {
                    ...location4,
                    badge: indicators.impreciseBadge,
                    aggregableBadges: [indicators.searchBasedBadge],
                },
                {
                    ...location9,
                    badge: indicators.impreciseBadge,
                    aggregableBadges: [indicators.searchBasedBadge],
                },
            ],
        ])
    })

    it('supplements LSIF results with search results (disabled)', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location4], [location4, location7, location8, location9]]),
            undefined,
            undefined,
            undefined,
            makeStubAPI(),
            () => false
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
            ],
        ])
    })

    it('supplements LSIF results with search results (toggled)', async () => {
        const mixedResults = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location4], [location4, location7, location8, location9]]),
            undefined,
            undefined,
            undefined,
            makeStubAPI(),
            () => true
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(mixedResults), [
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
                {
                    ...location4,
                    badge: indicators.impreciseBadge,
                    aggregableBadges: [indicators.searchBasedBadge],
                },
            ],
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
                {
                    ...location4,
                    badge: indicators.impreciseBadge,
                    aggregableBadges: [indicators.searchBasedBadge],
                },
                {
                    ...location9,
                    badge: indicators.impreciseBadge,
                    aggregableBadges: [indicators.searchBasedBadge],
                },
            ],
        ])

        const preciseResults = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location4], [location4, location7, location8, location9]]),
            undefined,
            undefined,
            undefined,
            makeStubAPI(),
            () => false
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        // Should immediately return all precise results from previous call
        assert.deepStrictEqual(await gatherValues(preciseResults), [
            [
                { ...location1, aggregableBadges: [indicators.semanticBadge] },
                { ...location2, aggregableBadges: [indicators.semanticBadge] },
                { ...location3, aggregableBadges: [indicators.semanticBadge] },
            ],
        ])
    })
})

describe('createHoverProvider', () => {
    it('uses LSIF definitions as source of truth', async () => {
        const searchDefinitionProvider = sinon.spy(() => asyncGeneratorFromValues([]))

        const result = createHoverProvider(
            LSIFSupport.None,
            () => Promise.resolve({ definition: [location1], hover: hover1 }),
            searchDefinitionProvider,
            () => asyncGeneratorFromValues([hover4]),
            () => asyncGeneratorFromValues([hover2, hover3]),
            undefined,
            undefined,
            makeStubAPI()
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover1,
                alerts: [indicators.lsif],
                aggregableBadges: [indicators.semanticBadge],
            },
        ])

        // Search providers not called at all
        assert.strictEqual(searchDefinitionProvider.called, false)
    })

    it('tags partial LSIF results', async () => {
        const searchDefinitionProvider = sinon.spy(() => asyncGeneratorFromValues([[location1]]))

        const result = createHoverProvider(
            LSIFSupport.None,
            () => Promise.resolve({ definition: [], hover: hover1 }),
            searchDefinitionProvider,
            () => asyncGeneratorFromValues([hover4]),
            () => asyncGeneratorFromValues([hover2, hover3]),
            undefined,
            undefined,
            makeStubAPI()
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover1,
                alerts: [indicators.lsifPartialHoverOnly],
                aggregableBadges: [indicators.partialHoverNoDefinitionBadge],
            },
        ])

        // Search providers called to determine if there's search hover text
        assert.strictEqual(searchDefinitionProvider.called, true)
    })

    it('does not tag partial LSIF results without search definition', async () => {
        const result = createHoverProvider(
            LSIFSupport.None,
            () => Promise.resolve({ definition: [], hover: hover1 }),
            () => asyncGeneratorFromValues([]),
            () => asyncGeneratorFromValues([hover4]),
            () => asyncGeneratorFromValues([hover2, hover3]),
            undefined,
            undefined,
            makeStubAPI()
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover1,
                alerts: [indicators.lsif],
                aggregableBadges: [indicators.semanticBadge],
            },
        ])
    })

    it('falls back to LSP when LSIF results are not found', async () => {
        const result = createHoverProvider(
            LSIFSupport.None,
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([]),
            () => asyncGeneratorFromValues([hover3]),
            () => asyncGeneratorFromValues([hover1, hover2]),
            undefined,
            undefined,
            makeStubAPI()
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover1,
                alerts: [indicators.lsp],
            },
            hover2,
        ])
    })

    it('falls back to search when precise results are not found', async () => {
        const result = createHoverProvider(
            LSIFSupport.None,
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([]),
            () => asyncGeneratorFromValues([hover3]),
            undefined,
            undefined,
            undefined,
            makeStubAPI()
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover3,
                alerts: [indicators.searchLSIFSupportNone],
                aggregableBadges: [indicators.searchBasedBadge],
            },
        ])
    })

    it('alerts search results correctly with experimental LSIF support', async () => {
        const result = createHoverProvider(
            LSIFSupport.Experimental,
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([]),
            () => asyncGeneratorFromValues([hover3]),
            undefined,
            undefined,
            undefined,
            makeStubAPI()
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover3,
                alerts: [indicators.searchLSIFSupportExperimental],
                aggregableBadges: [indicators.searchBasedBadge],
            },
        ])
    })

    it('alerts search results correctly with robust LSIF support', async () => {
        const result = createHoverProvider(
            LSIFSupport.Robust,
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([]),
            () => asyncGeneratorFromValues([hover3]),
            undefined,
            undefined,
            undefined,
            makeStubAPI()
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover3,
                alerts: [indicators.searchLSIFSupportRobust],
                aggregableBadges: [indicators.searchBasedBadge],
            },
        ])
    })
})

describe('createDocumentHighlightProvider', () => {
    it('uses LSIF document highlights', async () => {
        const result = createDocumentHighlightProvider(
            () => asyncGeneratorFromValues([[{ range: range1 }, { range: range2 }]]),
            undefined,
            undefined,
            makeStubAPI()
        ).provideDocumentHighlights(textDocument, position) as Observable<sourcegraph.DocumentHighlight[]>

        assert.deepStrictEqual(await gatherValues(result), [[{ range: range1 }, { range: range2 }]])
    })
})

async function* asyncGeneratorFromValues<P>(source: P[]): AsyncGenerator<P, void, undefined> {
    await Promise.resolve()

    for (const value of source) {
        yield value
    }
}

async function gatherValues<T>(observable: Observable<T>): Promise<T[]> {
    const values: T[] = []
    await new Promise<void>(complete => observable.subscribe({ next: value => values.push(value), complete }))
    return values
}
