import { from } from 'rxjs'
import { distinctUntilChanged, map, startWith } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'
import { LanguageSpec } from './language-specs/spec'
import { Logger, RedactingLogger } from './logging'
import { createProviderWrapper, ProviderWrapper } from './providers'

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

/**
 * Activate the extension.
 *
 * @param ctx  The extension context.
 * @param selector The document selector for which this extension is active.
 * @param languageSpec The language spec used to provide search-based code intelligence.
 * @param logger An optional logger instance.
 */
export function activateCodeIntel(
    context: sourcegraph.ExtensionContext = DUMMY_CTX,
    selector: sourcegraph.DocumentSelector,
    languageSpec: LanguageSpec,
    logger: Logger = new RedactingLogger(console)
): void {
    activateWithoutLSP(context, selector, createProviderWrapper(languageSpec, logger))
}

/**
 * Register definition, reference, and hover providers with LSIF and search-based providers.
 *
 * @param ctx The extension context.
 * @param selector The document selector for which this extension is active.
 * @param wrapper The provider wrapper.
 */
function activateWithoutLSP(
    context: sourcegraph.ExtensionContext,
    selector: sourcegraph.DocumentSelector,
    wrapper: ProviderWrapper
): void {
    context.subscriptions.add(sourcegraph.languages.registerDefinitionProvider(selector, wrapper.definition()))
    context.subscriptions.add(sourcegraph.languages.registerHoverProvider(selector, wrapper.hover()))

    // Do not try to register this provider on pre-3.18 instances as
    // it didn't exist.
    if (sourcegraph.languages.registerDocumentHighlightProvider) {
        context.subscriptions.add(
            sourcegraph.languages.registerDocumentHighlightProvider(selector, wrapper.documentHighlights())
        )
    }

    // Re-register the references provider whenever the value of the
    // mixPreciseAndSearchBasedReferences setting changes.

    let unsubscribeReferencesProvider: sourcegraph.Unsubscribable
    const registerReferencesProvider = (): void => {
        unsubscribeReferencesProvider?.unsubscribe()
        unsubscribeReferencesProvider = sourcegraph.languages.registerReferenceProvider(selector, wrapper.references())
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
}
