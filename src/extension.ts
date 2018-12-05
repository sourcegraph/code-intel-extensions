import * as sourcegraph from 'sourcegraph'
import { from, Observable } from 'rxjs'
import { first, map, distinctUntilChanged, finalize } from 'rxjs/operators'
import { Handler, Settings, DOCUMENT_SELECTOR } from './handler'

// No-op for Sourcegraph versions prior to 3.0-preview
const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    const h = new Handler()

    ctx.subscriptions.add(
        sourcegraph.commands.registerCommand(
            'basicCodeIntel.old.togglePreciseFuzzy',
            () => {
                // Toggle between 2 states:
                //
                // Enabled: basicCodeIntel.enabled = true and extensions.langserver/* = false
                //
                // Disabled: basicCodeIntel.enabled = false and extensions.langserver/* = true
                //
                // These 2 states are not inverses of each other. Enabling and disabling basic code
                // intel might enable or disable langserver extensions in a way that the user does not
                // expect or desire.
                const config = sourcegraph.configuration.get<
                    Settings & { extensions: { [id: string]: boolean } }
                >()

                const newEnabled = !config.get('basicCodeIntel.enabled')
                config
                    .update('basicCodeIntel.enabled', newEnabled)
                    .then(async () => {
                        const extensions = {
                            ...(config.get('extensions') || {}),
                        }
                        for (const extensionID of Object.keys(extensions)) {
                            if (
                                extensionID.startsWith('langserver/') ||
                                extensionID.includes('/langserver')
                            ) {
                                extensions[extensionID] = !newEnabled
                            }
                        }
                        await config.update('extensions', extensions)
                    })
                    .catch(err => console.error(err))
            }
        )
    )

    ctx.subscriptions.add(
        reregisterWhenEnablementChanges(() =>
            sourcegraph.languages.registerDefinitionProvider(
                DOCUMENT_SELECTOR,
                {
                    provideDefinition: (doc, pos) =>
                        enabledOrNull(() =>
                            observableOrPromiseCompat(h.definition(doc, pos))
                        ),
                }
            )
        )
    )
    ctx.subscriptions.add(
        reregisterWhenEnablementChanges(() =>
            sourcegraph.languages.registerReferenceProvider(DOCUMENT_SELECTOR, {
                provideReferences: (doc, pos) =>
                    enabledOrNull(() =>
                        observableOrPromiseCompat(h.references(doc, pos))
                    ),
            })
        )
    )
}

const settingsSubscribable = new Observable<Settings>(sub => {
    sub.next(sourcegraph.configuration.get().value)
    return sourcegraph.configuration.subscribe(() =>
        sub.next(sourcegraph.configuration.get().value)
    )
})

function enabledOrNull<T>(provider: () => T): T | null {
    if (
        !sourcegraph.configuration.get<Settings>().value[
            'basicCodeIntel.enabled'
        ]
    ) {
        return null
    }
    return provider()
}

/**
 * This makes it so that basicCodeIntel.toggle (the "Show/hide fuzzy matches" button) immediately takes effect and
 * changes the locations that are currently being displayed in the panel.
 *
 * If we used an observable instead, it would always show the loading indicator.
 */
function reregisterWhenEnablementChanges(
    register: () => sourcegraph.Unsubscribable
): sourcegraph.Unsubscribable {
    let registration: sourcegraph.Unsubscribable | undefined
    return from(settingsSubscribable)
        .pipe(
            distinctUntilChanged(
                (a, b) =>
                    Boolean(a['basicCodeIntel.enabled']) ===
                        Boolean(b['basicCodeIntel.enabled']) &&
                    a['basicCodeIntel.definition.symbols'] ===
                        b['basicCodeIntel.definition.symbols']
            ),
            map(() => {
                if (registration) {
                    registration.unsubscribe()
                }
                registration = register()
            }),
            finalize(() => {
                if (registration) {
                    registration.unsubscribe()
                    registration = undefined
                }
            })
        )
        .subscribe()
}

function observableOrPromiseCompat<T>(
    result: Observable<T> | Promise<T>
): sourcegraph.ProviderResult<T> {
    // HACK: Earlier extension API versions did not support providers returning observables. We can detect whether
    // the extension API version is compatible by checking for the presence of registerLocationProvider, which was
    // added around the same time.
    const supportsProvidersReturningObservables = !!sourcegraph.languages
        .registerLocationProvider
    return supportsProvidersReturningObservables
        ? from(result)
        : from(result)
              .pipe(first())
              .toPromise()
}
