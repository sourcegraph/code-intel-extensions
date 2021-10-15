import { from } from 'rxjs'
import { distinctUntilChanged, map, startWith } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'

import { API } from './util/api'
import { languageID } from './language'
import { languageSpecs } from './language-specs/languages'
import { LanguageSpec } from './language-specs/spec'
import { Logger, RedactingLogger } from './logging'
import { createProviders, SourcegraphProviders } from './providers'

/**
 * Register providers on the extension host.
 *
 * @param context The extension context.
 */
export const activate = (context: sourcegraph.ExtensionContext): void => {
    for (const spec of languageID === 'all'
        ? languageSpecs
        : languageSpecs.filter(spec => spec.languageID === languageID)) {
        activateCodeIntel(
            context,
            spec.fileExts.flatMap(extension => [{ pattern: `*.${extension}` }]),
            spec
        )
    }
}

/**
 * A dummy context that is used for versions of Sourcegraph to 3.0.
 */
const DUMMY_CTX = {
    subscriptions: {
        add: (): void => {
            /* no-op */
        },
    },
}

function once<T>(f: () => T): () => T {
    let run = false
    let val: T | null = null

    return () => {
        if (!run) {
            run = true
            val = f()
        }

        return val as T
    }
}

function onceAsync<T>(f: () => Promise<T>): () => Promise<T> {
    let run = false
    let val: T | null = null

    return async () => {
        if (!run) {
            run = true
            val = await f()
        }

        return val as T
    }
}

// const createPanel = once(() => {
//     sourcegraph.internal.updateContext({ implementations: false })

//     sourcegraph.workspace.openedTextDocuments.subscribe(textDocument => {
//         console.log('openedTextDoc:', textDocument)
//         if (textDocument.languageId != 'go') {
//             sourcegraph.internal.updateContext({ implementations: false })
//             return
//         }

//         // TODO: check for precise code intel

//         sourcegraph.internal.updateContext({ implementations: true })
//     })

//     let implementationsPanelID = 'implementations' + "go"

//     let implementationsPanel = sourcegraph.app.createPanelView(implementationsPanelID)
//     implementationsPanel.title = 'Implementations'
//     implementationsPanel.component = { locationProvider: implementationsPanelID }
//     implementationsPanel.priority = 160

//     // TODO:
//     // implementationsPanel.selector = "*.go"

//     return { implementationsPanel, implementationsPanelID }
// })

const hasImplementations = onceAsync(async () => {
    return await new API().hasImplementations()
})

/**
 * Create the panel for implementations.
 *
 * Makes sure to only create the panel once per session.
 */
const createImplementationPanel = async (
    context: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    languageSpec: LanguageSpec,
    providers: SourcegraphProviders
) => {
    if (!(await hasImplementations())) {
        return
    }

    sourcegraph.internal.updateContext({ implementations: false })

    let implementationsPanelID = 'implementations_' + languageSpec.languageID
    let implementationsPanel = sourcegraph.app.createPanelView(implementationsPanelID)
    implementationsPanel.title = 'Implementations'
    implementationsPanel.component = { locationProvider: implementationsPanelID }
    implementationsPanel.priority = 160

    // @ts-ignore
    implementationsPanel.selector = ["*.go"]

    context.subscriptions.add(implementationsPanel)
    context.subscriptions.add(
        sourcegraph.languages.registerLocationProvider(implementationsPanelID, selector, providers.implementations)
    )
}

/**
 * Activate the extension by registering definition, reference, and hover providers
 * with LSIF and search-based providers.
 *
 * @param context  The extension context.
 * @param selector The document selector for which this extension is active.
 * @param languageSpec The language spec used to provide search-based code intelligence.
 * @param logger An optional logger instance.
 */
const activateCodeIntel = (
    context: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    languageSpec: LanguageSpec,
    logger: Logger = new RedactingLogger(console)
): void => {
    console.log('activatin code intel', languageSpec.languageID)
    const providers = createProviders(languageSpec, logger)
    context.subscriptions.add(sourcegraph.languages.registerDefinitionProvider(selector, providers.definition))
    context.subscriptions.add(sourcegraph.languages.registerHoverProvider(selector, providers.hover))

    // Do not try to register this provider on pre-3.18 instances as
    // it didn't exist.
    if (sourcegraph.languages.registerDocumentHighlightProvider) {
        context.subscriptions.add(
            sourcegraph.languages.registerDocumentHighlightProvider(selector, providers.documentHighlights)
        )
    }

    // Re-register the references provider whenever the value of the
    // mixPreciseAndSearchBasedReferences setting changes.

    let unsubscribeReferencesProvider: sourcegraph.Unsubscribable
    const registerReferencesProvider = (): void => {
        unsubscribeReferencesProvider?.unsubscribe()
        unsubscribeReferencesProvider = sourcegraph.languages.registerReferenceProvider(selector, providers.references)
        context.subscriptions.add(unsubscribeReferencesProvider)
    }

    context.subscriptions.add(
        from(sourcegraph.configuration)
            .pipe(
                startWith(false),
                map(() => sourcegraph.configuration.get().get('codeIntel.mixPreciseAndSearchBasedReferences') ?? false),
                distinctUntilChanged(),
                map(registerReferencesProvider)
            )
            .subscribe()
    )

    if (languageSpec.textDocumentImplemenationSupport) {
        // Implementations: create a panel and register a locations provider.
        // The "Find implementations" button in the hover is specified in package.json (look for "findImplementations").
        createImplementationPanel(context, selector, languageSpec, providers)
    }
}
