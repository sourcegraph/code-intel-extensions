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

function once<T>(f: () => T): () => T  {
  let run = false;
  let val: T | null = null;

  // @ts-ignore: This is how once works, please typescript.
  return () => {
    if (!run) {
      run = true;
      val = f();
    }

    return val
  }
}

const createPanel = once(() => {
  let implementationsPanelID = 'implementations'
  let implementationsPanel = sourcegraph.app.createPanelView(implementationsPanelID)

  implementationsPanel.title = 'Implementations'
  implementationsPanel.component = { locationProvider: implementationsPanelID }
  implementationsPanel.priority = 160
  return { implementationsPanel, implementationsPanelID }
})

/**
 * Create the panel for implementations.
 *
 * Makes sure to only create the panel once per session.
 */
const createImplementationPanel = async (
    context: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    providers: SourcegraphProviders
) => {
    if (!await new API().hasImplementations()) {
        return
    }

    let { implementationsPanel, implementationsPanelID } = createPanel()

    context.subscriptions.add(implementationsPanel)
    context.subscriptions.add(
        sourcegraph.languages.registerLocationProvider(
            implementationsPanelID,
            selector,
            providers.implementations
        )
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

    // Implementations: create a panel and register a locations provider.
    // The "Find implementations" button in the hover is specified in package.json (look for "findImplementations").
    createImplementationPanel(context, selector, providers)
}
