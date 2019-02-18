import * as sourcegraph from 'sourcegraph'
import { from, Observable } from 'rxjs'
import { first } from 'rxjs/operators'
import { Handler, documentSelector, HandlerArgs } from './handler'

// No-op for Sourcegraph versions prior to 3.0-preview
const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activateBasicCodeIntel(
    args: HandlerArgs
): (ctx: sourcegraph.ExtensionContext) => void {
    return function activate(
        ctx: sourcegraph.ExtensionContext = DUMMY_CTX
    ): void {
        const h = new Handler(args)

        ctx.subscriptions.add(
            sourcegraph.languages.registerHoverProvider(
                documentSelector(h.fileExts),
                {
                    provideHover: (doc, pos) =>
                        observableOrPromiseCompat(h.hover(doc, pos)),
                }
            )
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerDefinitionProvider(
                documentSelector(h.fileExts),
                {
                    provideDefinition: (doc, pos) =>
                        observableOrPromiseCompat(h.definition(doc, pos)),
                }
            )
        )
        ctx.subscriptions.add(
            sourcegraph.languages.registerReferenceProvider(
                documentSelector(h.fileExts),
                {
                    provideReferences: (doc, pos) =>
                        observableOrPromiseCompat(h.references(doc, pos)),
                }
            )
        )
    }
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
