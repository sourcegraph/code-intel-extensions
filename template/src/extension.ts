import { Handler, initLSIF, NoData } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { documentSelector } from '../../package/lib/handler'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

/** circle-question mark icon filled #ffffff */
const whiteQuestionIcon =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZmZmZiI+PHBhdGggZD0iTTExLDE4SDEzVjE2SDExVjE4TTEyLDJDNi40OCwyIDIsNi40OCAyLDEyQzIsMTcuNTIgNi40OCwyMiAxMiwyMkMxNy41MiwyMiAyMiwxNy41MiAyMiwxMkMyMiw2LjQ4IDE3LjUyLDIgMTIsMk0xMiwyMEM3LjU5LDIwIDQsMTYuNDEgNCwxMkM0LDcuNTkgNy41OSw0IDEyLDRDMTYuNDEsNCAyMCw3LjU5IDIwLDEyQzIwLDE2LjQxIDE2LjQxLDIwIDEyLDIwTTEyLDZDOS43OSw2IDgsNy43OSA4LDEwSDEwQzEwLDguOSAxMC45LDggMTIsOEMxMy4xLDggMTQsOC45IDE0LDEwQzE0LDEyIDExLDExLjc1IDExLDE1SDEzQzEzLDEyLjc1IDE2LDEyLjUgMTYsMTBDMTYsNy43OSAxNC4yMSw2IDEyLDZaIj48L3BhdGg+PC9zdmc+'

/** circle-question mark icon filled #000000 */
const blackQuestionIcon =
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzAwMDAwMCI+PHBhdGggZD0iTTExLDE4SDEzVjE2SDExVjE4TTEyLDJDNi40OCwyIDIsNi40OCAyLDEyQzIsMTcuNTIgNi40OCwyMiAxMiwyMkMxNy41MiwyMiAyMiwxNy41MiAyMiwxMkMyMiw2LjQ4IDE3LjUyLDIgMTIsMk0xMiwyMEM3LjU5LDIwIDQsMTYuNDEgNCwxMkM0LDcuNTkgNy41OSw0IDEyLDRDMTYuNDEsNCAyMCw3LjU5IDIwLDEyQzIwLDE2LjQxIDE2LjQxLDIwIDEyLDIwTTEyLDZDOS43OSw2IDgsNy43OSA4LDEwSDEwQzEwLDguOSAxMC45LDggMTIsOEMxMy4xLDggMTQsOC45IDE0LDEwQzE0LDEyIDExLDExLjc1IDExLDE1SDEzQzEzLDEyLjc1IDE2LDEyLjUgMTYsMTBDMTYsNy43OSAxNC4yMSw2IDEyLDZaIj48L3BhdGg+PC9zdmc+'

/** The badge to display when search-based results are returned in repositories that have LSIF data */
const fallbackBadge = {
    icon: whiteQuestionIcon,
    hoverMessage: 'Result is heuristic',
    light: { icon: blackQuestionIcon },
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
                    if (lsifResult !== undefined && lsifResult !== NoData) {
                        return lsifResult.value
                    }

                    // Fall back to search-based hover result
                    const val = await handler.hover(doc, pos)
                    if (!val) {
                        return undefined
                    }

                    return {
                        ...val,
                        // If LSIF was enabled and we have data for that repo, show a badge
                        badge:
                            lsifResult !== undefined ? fallbackBadge : undefined,
                    }
                },
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(selector, {
                provideDefinition: async (doc, pos) => {
                    // Return LSIF result if one exists
                    const lsifResult = await lsif.definition(doc, pos)
                    if (lsifResult !== undefined && lsifResult !== NoData) {
                        return lsifResult.value
                    }

                    // Fall back to search-based hover result
                    const val = await handler.definition(doc, pos)
                    if (!val) {
                        return undefined
                    }

                    return val.map(v => ({
                        ...v,
                        // If LSIF was enabled and we have data for that repo, show a badge
                        badge:
                            lsifResult !== undefined ? fallbackBadge : undefined,
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
                        lsifResult !== undefined && lsifResult !== NoData
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

                            // If LSIF was enabled and we have data for that repo, show a badge
                            badge:
                                lsifResult !== undefined
                                    ? fallbackBadge
                                    : undefined,
                        })),
                    ]
                },
            })
        )
    }
}
