import { extname } from 'path'
import * as sourcegraph from 'sourcegraph'
import { parseGitURI } from '../util/uri'

type Scope =
    | 'current file'
    | 'current repository'
    | 'all repositories'
    | 'other repositories'

type SearchType = 'symbol' | 'file'

/**
 * Create a search query to find definitions of a symbol.
 *
 * @param args Parameter bag.
 */
export function definitionQueries({
    searchToken,
    doc,
    fileExts,
    isSourcegraphDotCom,
}: {
    /** The search term. */
    searchToken: string
    /** The current text document. */
    doc: sourcegraph.TextDocument
    /** File extensions used by the current extension. */
    fileExts: string[]
    /** True to disable searching in other repositories. */
    isSourcegraphDotCom: boolean
}): string[] {
    const queryIn = (scope: Scope): string =>
        makeQuery({
            searchToken: `^${searchToken}$`,
            searchType: 'symbol',
            currentFileUri: new URL(doc.uri),
            scope,
            fileExts,
        })

    return [
        queryIn('current repository'),
        ...(isSourcegraphDotCom ? [] : [queryIn('all repositories')]),
    ]
}

/**
 * Create a search query to find references of a symbol.
 *
 * @param args Parameter bag.
 */
export function referencesQueries({
    searchToken,
    doc,
    fileExts,
    isSourcegraphDotCom,
}: {
    /** The search term. */
    searchToken: string
    /** The current text document. */
    doc: sourcegraph.TextDocument
    /** File extensions used by the current extension. */
    fileExts: string[]
    /** True to disable searching in other repositories. */
    isSourcegraphDotCom: boolean
}): string[] {
    const queryIn = (scope: Scope): string =>
        makeQuery({
            searchToken: `\\b${searchToken}\\b`,
            searchType: 'file',
            currentFileUri: new URL(doc.uri),
            scope,
            fileExts,
        })

    return [
        queryIn('current repository'),
        ...(isSourcegraphDotCom ? [] : [queryIn('other repositories')]),
    ]
}

/**
 * Create a search query.
 *
 * @param args Parameter bag.
 */
function makeQuery({
    searchToken,
    searchType,
    currentFileUri,
    scope,
    fileExts,
}: {
    /** The search term. */
    searchToken: string
    /** The type of search to perform. */
    searchType: SearchType
    /** The URI of the current file. */
    currentFileUri: URL
    /** Where to search. */
    scope: Scope
    /** File extensions in which to limit the search. */
    fileExts: string[]
}): string {
    const { repo, commit, path } = parseGitURI(currentFileUri)

    const scopeThings = {
        'current file': [`repo:^${repo}$@${commit}`, `file:^${path}$`],
        'current repository': [`repo:^${repo}$@${commit}`],
        'all repositories': [],
        'other repositories': [`-repo:^${repo}$`],
    }

    const terms = [
        searchToken,
        'case:yes',
        `type:${searchType}`,
        ...scopeThings[scope],
        fileExtensionTerm(path, fileExts),
    ]

    return terms.filter(x => !!x).join(' ')
}

const blacklist = ['thrift', 'proto', 'graphql']

/**
 * Constructs a file extension term (or an empty string) if the current file end
 * in one of the extensions for the current langauge and does NOT end in one of
 * the blacklisted files defined above.
 *
 * @param path The path of the current text file.
 * @param whitelist The file extensions for the current language.
 */
function fileExtensionTerm(path: string, whitelist: string[]): string {
    const ext = extname(path).substring(1)
    if (!ext || blacklist.includes(ext) || !whitelist.includes(ext)) {
        return ''
    }

    return `file:\\.(${whitelist.join('|')})$`
}
