import { Handler, HandlerArgs } from '../../package/lib'
import * as sourcegraph from 'sourcegraph'
import { languageSpecs } from '../../languages'
import { documentSelector } from '../../package/lib/handler'
import { concat, of } from 'rxjs'

const DUMMY_CTX = { subscriptions: { add: (_unsubscribable: any) => void 0 } }

export function activate(ctx: sourcegraph.ExtensionContext = DUMMY_CTX): void {
    // This is set to an individual language ID by the generator script.
    const languageID = 'all'

    if (languageID === 'all') {
        for (const languageSpec of languageSpecs) {
            activateWithArgs(ctx, { ...languageSpec.handlerArgs, sourcegraph })
        }
    } else {
        // TODO consider Record<LanguageID, LanguageSpec>
        activateWithArgs(ctx, {
            ...languageSpecs.find(l => l.handlerArgs.languageID === languageID)!
                .handlerArgs,
            sourcegraph,
        })
    }
}

function activateWithArgs(
    ctx: sourcegraph.ExtensionContext,
    args: HandlerArgs
): void {
    const h = new Handler({ ...args, sourcegraph })

    sourcegraph.internal.updateContext({ isImprecise: true })

    if (sourcegraph.configuration.get().get('basicCodeIntel.showFeedback')) {
        concat(
            // Update the context once upon page load...
            of(undefined),
            // ...and whenever a document is opened.
            sourcegraph.workspace.onDidOpenTextDocument
        ).subscribe(document => {
            sourcegraph.internal.updateContext({
                showFeedback: true,
                'codeIntel.feedbackLink': feedbackLink({
                    currentFile: document && document.uri,
                    language: args.languageID,
                    kind: 'Default',
                }).href,
            })
        })
    }

    ctx.subscriptions.add(
        sourcegraph.languages.registerHoverProvider(
            documentSelector(h.fileExts),
            {
                provideHover: (doc, pos) => h.hover(doc, pos),
            }
        )
    )
    ctx.subscriptions.add(
        sourcegraph.languages.registerDefinitionProvider(
            documentSelector(h.fileExts),
            {
                provideDefinition: (doc, pos) => h.definition(doc, pos),
            }
        )
    )
    ctx.subscriptions.add(
        sourcegraph.languages.registerReferenceProvider(
            documentSelector(h.fileExts),
            {
                provideReferences: (doc, pos) => h.references(doc, pos),
            }
        )
    )
}

function feedbackLink({
    currentFile,
    language,
    kind,
}: {
    currentFile?: string
    language: string
    kind: 'Default' | 'Precise'
}): URL {
    const url = new URL(
        'https://docs.google.com/forms/d/e/1FAIpQLSfmn4M3nVj6R5m8UuAor_4ft8IMhieND_Uu8AlerhGO7X9C9w/viewform?usp=pp_url'
    )
    if (currentFile) {
        url.searchParams.append('entry.1135698969', currentFile)
    }
    url.searchParams.append('entry.55312909', language)
    url.searchParams.append('entry.1824476739', kind)
    return url
}
