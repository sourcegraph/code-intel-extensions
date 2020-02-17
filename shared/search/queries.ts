import { extname } from 'path'
import * as sourcegraph from 'sourcegraph'
import { parseGitURI } from '../util/uri'

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
    const { repo, commit, path } = parseGitURI(new URL(doc.uri))

    const searchTerms = [
        `^${searchToken}$`,
        `type:symbol`,
        `patternType:regexp`,
        'case:yes',
        fileExtensionTerm(path, fileExts),
    ]

    return makeQueries(
        isSourcegraphDotCom,
        // Always test same repo
        [...searchTerms, `repo:^${repo}$@${commit}`],
        // Search globally if not on dotcom
        [...searchTerms]
    )
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
    const { repo, commit, path } = parseGitURI(new URL(doc.uri))

    const searchTerms = [
        `\\b${searchToken}\\b`,
        `type:file`,
        `patternType:regexp`,
        'case:yes',
        fileExtensionTerm(path, fileExts),
    ]

    return makeQueries(
        isSourcegraphDotCom,
        // Always look in same commit
        [...searchTerms, `repo:^${repo}$@${commit}`],
        // Look in other repos when not on dotcom
        [...searchTerms, `-repo:^${repo}$`]
    )
}

/**
 * Builds a set of queries based on the current instance environment.
 *
 * @param isSourcegraphDotCom True if the current instance is dotcom.
 * @param standardQueryTerms The terms to search on all instances.
 * @param instanceQueryTerms The terms to search on non-dotcom instances.
 */
function makeQueries(
    isSourcegraphDotCom: boolean,
    standardQueryTerms: string[],
    instanceQueryTerms: string[]
): string[] {
    return isSourcegraphDotCom
        ? [standardQueryTerms.join(' ')]
        : [standardQueryTerms.join(' '), instanceQueryTerms.join(' ')]
}

const blacklist = ['thrift', 'proto', 'graphql']

/**
 * Constructs a file extension term (or an empty string) if the current file end
 * in one of the extensions for the current language and does NOT end in one of
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
