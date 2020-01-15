import { Handler, initLSIF, impreciseBadge } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { documentSelector } from '../../package/lib/handler'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

// Gets an opaque value that is the same for all locations
// within a file but different from other files.
const file = (loc: sourcegraph.Location) =>
    `${loc.uri.host} ${loc.uri.pathname} ${loc.uri.hash}`

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    // LSIF is not language-specific, and we only want to initialize it once.
    // Otherwise we will make a flurry of calls to the frontend to check if
    // LSIF is enabled.
    const lsif = initLSIF()

    for (const languageSpec of languageID === 'all'
        ? languageSpecs
        : [languageSpecs.find(l => l.handlerArgs.languageID === languageID)!]) {
        const handler = new Handler({
            ...languageSpec.handlerArgs,
            sourcegraph,
        })
        const selector = documentSelector(languageSpec.handlerArgs.fileExts)
        ctx.subscriptions.add(
            sourcegraph.languages.registerHoverProvider(selector, {
                provideHover: async (doc, pos) => {
                    const lsifResult = await lsif.hover(doc, pos)
                    if (lsifResult) {
                        return lsifResult.value
                    }

                    const val = await handler.hover(doc, pos)
                    if (!val) {
                        return undefined
                    }

                    return { ...val, badge: impreciseBadge }
                },
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(selector, {
                provideDefinition: async (doc, pos) => {
                    const lsifResult = await lsif.definition(doc, pos)
                    if (lsifResult) {
                        return lsifResult.value
                    }

                    const val = await handler.definition(doc, pos)
                    if (!val) {
                        return undefined
                    }

                    console.log('ok gonna add imprecise...', {
                        vs: val.map(v => ({ ...v, badge: impreciseBadge })),
                    })

                    return val.map(v => ({ ...v, badge: impreciseBadge }))
                },
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerReferenceProvider(selector, {
                provideReferences: async (doc, pos) => {
                    // Get and extract LSIF results
                    const lsifResult = await lsif.references(doc, pos)
                    const lsifValues = lsifResult ? lsifResult.value : []
                    const lsifFiles = new Set(lsifValues.map(file))

                    // Unconditionally get search references and append them with
                    // precise results because LSIF data might be sparse. Remove any
                    // search-based result that occurs in a file with an LSIF result.
                    const searchReferences = (await handler.references(
                        doc,
                        pos
                    )).filter(fuzzyRef => !lsifFiles.has(file(fuzzyRef)))

                    return [
                        ...lsifValues,
                        ...searchReferences.map(v => ({
                            ...v,
                            badge: impreciseBadge,
                        })),
                    ]
                },
            })
        )
    }
}
