import { Handler, initLSIF, asyncFirst, wrapMaybe } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { documentSelector } from '../../package/lib/handler'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

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
                provideHover: asyncFirst(
                    [lsif.hover, wrapMaybe(handler.hover.bind(handler))],
                    null
                ),
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(selector, {
                provideDefinition: asyncFirst(
                    [
                        lsif.definition,
                        wrapMaybe(handler.definition.bind(handler)),
                    ],
                    null
                ),
            })
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerReferenceProvider(selector, {
                provideReferences: async (doc, pos) => {
                    // Gets an opaque value that is the same for all locations
                    // within a file but different from other files.
                    const file = (loc: sourcegraph.Location) =>
                        `${loc.uri.host} ${loc.uri.pathname} ${loc.uri.hash}`

                    // Concatenates LSIF results (if present) with fuzzy results
                    // because LSIF data might be sparse.
                    const lsifReferences = await lsif.references(doc, pos)
                    const fuzzyReferences = await handler.references(doc, pos)

                    const lsifFiles = new Set(
                        (lsifReferences ? lsifReferences.value : []).map(file)
                    )

                    return [
                        ...(lsifReferences === undefined
                            ? []
                            : lsifReferences.value),
                        // Drop fuzzy references from files that have LSIF results.
                        ...fuzzyReferences.filter(
                            fuzzyRef => !lsifFiles.has(file(fuzzyRef))
                        ),
                    ]
                },
            })
        )
    }
}
