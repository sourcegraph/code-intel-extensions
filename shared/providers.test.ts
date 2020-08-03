import { createStubTextDocument } from '@sourcegraph/extension-api-stubs'
import * as assert from 'assert'
import { Observable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { impreciseBadge } from './badges'
import {
    createDefinitionProvider,
    createHoverProvider,
    createReferencesProvider,
    createDocumentHighlightProvider,
} from './providers'
import * as HoverAlerts from './hoverAlerts'
import { LSIFSupport } from './language-specs/spec'

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

describe('createDefinitionProvider', () => {
    it('uses LSIF definitions as source of truth', async () => {
        const result = createDefinitionProvider(
            () => Promise.resolve({ definition:[location1, location2],hover:null}),
            () => asyncGeneratorFromValues([location5]),
            () => asyncGeneratorFromValues([location3, location4])
        ).provideDefinition(textDocument, position) as Observable<sourcegraph.Definition>

        assert.deepStrictEqual(await gatherValues(result), [location1, location2])
    })

    it('falls back to LSP when LSIF results are not found', async () => {
        const result = createDefinitionProvider(
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([location3]),
            () => asyncGeneratorFromValues([location1, location2])
        ).provideDefinition(textDocument, position) as Observable<sourcegraph.Definition>

        assert.deepStrictEqual(await gatherValues(result), [location1, location2])
    })

    it('falls back to basic when precise results are not found', async () => {
        const result = createDefinitionProvider(
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([location3])
        ).provideDefinition(textDocument, position) as Observable<sourcegraph.Definition>

        assert.deepStrictEqual(await gatherValues(result), [{ ...location3, badge: impreciseBadge }])
    })
})

describe('createReferencesProvider', () => {
    it('uses LSIF definitions as source of truth', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([])
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [location1, location2],
            [location1, location2, location3],
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
                ])
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
            () => asyncGeneratorFromValues([[location4, location5]])
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [location1, location2],
            [location1, location2, location3],
            [location1, location2, location3, location4, location5],
        ])
    })

    it('supplements LSIF results with search results', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location4]])
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [location1, location2],
            [location1, location2, location3],
            [location1, location2, location3, { ...location4, badge: impreciseBadge }],
        ])
    })

    it('supplements LSIF results with non-overlapping search results', async () => {
        const result = createReferencesProvider(
            () =>
                asyncGeneratorFromValues([
                    [location1, location2],
                    [location1, location2, location3],
                ]),
            () => asyncGeneratorFromValues([[location4], [location4, location7, location8, location9]])
        ).provideReferences(textDocument, position, {
            includeDeclaration: false,
        }) as Observable<sourcegraph.Badged<sourcegraph.Location>[]>

        assert.deepStrictEqual(await gatherValues(result), [
            [location1, location2],
            [location1, location2, location3],
            [location1, location2, location3, { ...location4, badge: impreciseBadge }],
            [
                location1,
                location2,
                location3,
                { ...location4, badge: impreciseBadge },
                { ...location9, badge: impreciseBadge },
            ],
        ])
    })
})

describe('createHoverProvider', () => {
    it('uses LSIF definitions as source of truth', async () => {
        const result = createHoverProvider(
            LSIFSupport.None,
            () =>Promise.resolve({ definition: [], hover: hover1 }),
            () => asyncGeneratorFromValues([hover4]),
            () => asyncGeneratorFromValues([hover2, hover3])
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [{ ...hover1, alerts: HoverAlerts.lsif }, ])
    })

    it('falls back to LSP when LSIF results are not found', async () => {
        const result = createHoverProvider(
            LSIFSupport.None,
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([hover3]),
            () => asyncGeneratorFromValues([hover1, hover2])
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [{ ...hover1, alerts: HoverAlerts.lsp }, hover2])
    })

    it('falls back to basic when precise results are not found', async () => {
        const result = createHoverProvider(
            LSIFSupport.None,
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([hover3])
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [{ ...hover3, alerts: HoverAlerts.searchLSIFSupportNone }])
    })

    it('alerts search results correctly with experimental LSIF support', async () => {
        const result = createHoverProvider(
            LSIFSupport.Experimental,
            () =>Promise.resolve(null),
            () => asyncGeneratorFromValues([hover3])
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [
            {
                ...hover3,
                alerts: HoverAlerts.searchLSIFSupportExperimental,
            },
        ])
    })

    it('alerts search results correctly with robust LSIF support', async () => {
        const result = createHoverProvider(
            LSIFSupport.Robust,
            () => Promise.resolve(null),
            () => asyncGeneratorFromValues([hover3])
        ).provideHover(textDocument, position) as Observable<sourcegraph.Badged<sourcegraph.Hover>>

        assert.deepStrictEqual(await gatherValues(result), [{ ...hover3, alerts: HoverAlerts.searchLSIFSupportRobust }])
    })
})

describe('createDocumentHighlightProvider', () => {
    it('uses LSIF document highlights', async () => {
        const result = createDocumentHighlightProvider(
            () => asyncGeneratorFromValues([[{ range: range1 }, { range: range2 }]]),
            () => asyncGeneratorFromValues([]),
            () => asyncGeneratorFromValues([])
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
    await new Promise(complete => observable.subscribe({ next: value => values.push(value), complete }))
    return values
}
