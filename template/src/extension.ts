import { Handler, initLSIF, StaleData } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { documentSelector } from '../../package/lib/handler'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

// TODO
/** circled question mark icons */
const whiteBadge = `data:image/svg+xml;base64,${btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox="0 0 24 24" fill="#ffffff"><path d="M11,18H13V16H11V18M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6C9.79,6 8,7.79 8,10H10C10,8.9 10.9,8 12,8C13.1,8 14,8.9 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10C16,7.79 14.21,6 12,6Z"></path></svg>`
)}`
const blackBadge = `data:image/svg+xml;base64,${btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox="0 0 24 24" fill="#000000"><path d="M11,18H13V16H11V18M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6C9.79,6 8,7.79 8,10H10C10,8.9 10.9,8 12,8C13.1,8 14,8.9 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10C16,7.79 14.21,6 12,6Z"></path></svg>`
)}`

// TODO
const badge = {
    icon: whiteBadge,
    hoverMessage: '...Heuristic...', // TODO
    light: { icon: blackBadge },
}

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    for (const languageSpec of languageID === 'all'
        ? languageSpecs
        : [languageSpecs.find(l => l.handlerArgs.languageID === languageID)!]) {
        const lsif = initLSIF()
        const handler = new Handler({
            ...languageSpec.handlerArgs,
            sourcegraph,
        })
        const selector = documentSelector(languageSpec.handlerArgs.fileExts)
        ctx.subscriptions.add(
            sourcegraph.languages.registerHoverProvider(selector, {
                provideHover: async (doc, pos) => {
                    // Return LSIF result if one exists
                    const lsifResult = await lsif.hover(doc, pos)
                    if (lsifResult !== undefined && lsifResult !== StaleData) {
                        return lsifResult.value
                    }

                    // Fall back to search-based hover result
                    const val = await handler.hover(doc, pos)
                    if (!val) {
                        return undefined
                    }

                    return {
                        ...val,
                        badge,
                    }
                },
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(selector, {
                provideDefinition: async (doc, pos) => {
                    // Return LSIF result if one exists
                    const lsifResult = await lsif.definition(doc, pos)
                    if (lsifResult !== undefined && lsifResult !== StaleData) {
                        return lsifResult.value
                    }

                    // Fall back to search-based hover result
                    const val = await handler.definition(doc, pos)
                    if (!val) {
                        return undefined
                    }

                    return val.map(v => ({
                        ...v,
                        badge,
                    }))
                },
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerReferenceProvider(selector, {
                provideReferences: async (doc, pos) => {
                    // Gets an opaque value that is the same for all locations
                    // within a file but different from other files.
                    const file = (loc: sourcegraph.Location) =>
                        `${loc.uri.host} ${loc.uri.pathname} ${loc.uri.hash}`

                    // Get and extract LSIF results
                    const lsifResult = await lsif.references(doc, pos)
                    const lsifValues =
                        lsifResult !== undefined && lsifResult !== StaleData
                            ? lsifResult.value
                            : []

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
                            badge,
                        })),
                    ]
                },
            })
        )
    }
}
