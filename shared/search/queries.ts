import { extname } from 'path'
import * as sourcegraph from 'sourcegraph'
import { parseGitURI } from '../util/uri'

/**
 * Create a search query to find definitions of a symbol.
 *
 * @param args Parameter bag.
 */
export function definitionQuery({
    searchToken,
    doc,
    fileExts,
}: {
    /** The search token text. */
    searchToken: string
    /** The current text document. */
    doc: sourcegraph.TextDocument
    /** File extensions used by the current extension. */
    fileExts: string[]
}): string[] {
    return [`^${searchToken}$`, 'type:symbol', 'patternType:regexp', 'case:yes', fileExtensionTerm(doc, fileExts)]
}

/**
 * Create a search query to find references of a symbol.
 *
 * @param args Parameter bag.
 */
export function referencesQuery({
    searchToken,
    doc,
    fileExts,
}: {
    /** The search token text. */
    searchToken: string
    /** The current text document. */
    doc: sourcegraph.TextDocument
    /** File extensions used by the current extension. */
    fileExts: string[]
}): string[] {
    return [`\\b${searchToken}\\b`, 'type:file', 'patternType:regexp', 'case:yes', fileExtensionTerm(doc, fileExts)]
}

const excludelist = new Set(['thrift', 'proto', 'graphql'])

/**
 * Constructs a file term containing include-listed extensions. If the current
 * text document path has an excluded extension or an extension absent from the
 * include list, an empty file term will be returned.
 *
 * @param textDocument The current text document.
 * @param includelist The file extensions for the current language.
 */
function fileExtensionTerm(textDocument: sourcegraph.TextDocument, includelist: string[]): string {
    const { path } = parseGitURI(new URL(textDocument.uri))
    const extension = extname(path).slice(1)
    if (!extension || excludelist.has(extension) || !includelist.includes(extension)) {
        return ''
    }

    return `file:\\.(${includelist.join('|')})$`
}
