import { from, Observable } from 'rxjs'
import * as sourcegraph from 'sourcegraph'
import { API } from '../../../shared/util/api'
import { parseGitURI } from '../../../shared/util/uri'

/**
 * Register providers on the extension host.
 *
 * @param ctx The extension context.
 */
export async function activate(context: sourcegraph.ExtensionContext): Promise<void> {
    const api = new API()

    const testFileContent = async (textDocument: sourcegraph.TextDocument) => {
        const { uri, text } = textDocument
        const { repo, commit, path } = parseGitURI(new URL(uri))

        if (text && text !== await api.getFileContent(repo, commit, path)) {
            console.log('textDocument.text=', text)
        }
    }

    context.subscriptions.add(
        sourcegraph.languages.registerDefinitionProvider([{ pattern: '*.go' }], {
            provideDefinition: (doc: sourcegraph.TextDocument): Observable<sourcegraph.Definition> =>
                from(testFileContent(doc).then(() => null)),
        })
    )
}
