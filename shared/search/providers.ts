import { flatten, sortBy } from 'lodash'
import * as sourcegraph from 'sourcegraph'
import { LanguageSpec, Result } from '../language-specs/spec'
import { Providers } from '../providers'
import {
    getFileContent as getFileContentFromApi,
    search as searchViaApi,
} from '../util/api'
import { asyncGeneratorFromPromise } from '../util/ix'
import { parseGitURI } from '../util/uri'
import { asArray, isDefined } from '../util/util'
import { resultToLocation, searchResultToResults } from './conversion'
import { findDocstring } from './docstrings'
import { wrapIndentationInCodeBlocks } from './markdown'
import { definitionQueries, referencesQueries } from './queries'
import { Settings } from './settings'
import { findSearchToken } from './tokens'

/**
 * Creates providers powered by search-based code intelligence.
 *
 * @param spec The language spec.
 */
export function createProviders({
    languageID,
    fileExts = [],
    commentStyle,
    identCharPattern,
    docstringIgnore,
    filterDefinitions: filterDefinitions = ({ results }) => results,
}: LanguageSpec): Providers {
    /**
     * Return the text document content adn the search token found under the
     * current hover position. Returns undefined if either piece of data could
     * not be determined.
     *
     * @param doc The current text document.
     * @param pos The current hover position.
     */
    const getContentAndToken = async (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<{ text: string; searchToken: string } | undefined> => {
        const text = await getFileContent(doc)
        if (!text) {
            return undefined
        }

        const tokenResult = findSearchToken({
            text,
            position: pos,
            lineRegex: commentStyle?.lineRegex,
            identCharPattern,
        })
        if (!tokenResult || tokenResult.isComment) {
            return undefined
        }

        return { text, searchToken: tokenResult.searchToken }
    }

    /**
     * Retrieve a definition for the current hover position.
     *
     * @param doc The current text document.
     * @param position The current hover position.
     */
    const definition = async (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<sourcegraph.Definition> => {
        const contentAndToken = await getContentAndToken(doc, pos)
        if (!contentAndToken) {
            return null
        }
        const { text, searchToken } = contentAndToken

        // Construct common args to the filterDefinitions function
        const { repo, commit, path } = parseGitURI(new URL(doc.uri))
        const filterParams = {
            repo,
            rev: commit,
            filePath: path,
            pos,
            fileContent: text,
        }

        const queries = definitionQueries({
            searchToken,
            doc,
            fileExts,
            isSourcegraphDotCom: isSourcegraphDotCom(),
        })

        /**
         * Filter search results before passing them to the language spec filter function.
         * This removes all results that are either public symbols or they belong to the
         * current text document.
         *
         * @param result The search result.
         */
        const isSymbolVisible = ({
            fileLocal,
            file,
            symbolKind,
        }: Result): boolean => {
            // Enum members are always public, but there's an open ctags bug that
            // doesn't let us treat that way.
            // See https://github.com/universal-ctags/ctags/issues/1844

            if (doc.languageId === 'java' && symbolKind === 'ENUMMEMBER') {
                return true
            }

            return !fileLocal || file === path
        }

        for (const query of queries) {
            // Perform search and perform pre-filtering before passing it
            // off to the language spec for the proper filtering pass.
            const searchResults = await search(query)
            const preFilteredResults = searchResults.filter(isSymbolVisible)

            // Filter results based on language spec
            const filteredResults = filterDefinitions({
                ...filterParams,
                results: preFilteredResults,
            }).map(resultToLocation)

            if (filteredResults.length > 0) {
                // Return first set of results found. There is generally exactly
                // one so there is little utility in merging results from the other
                // queries here as well.
                return sortByProximity(filteredResults, new URL(doc.uri))
            }
        }

        return []
    }

    /**
     * Retrieve references for the current hover position.
     *
     * @param doc The current text document.
     * @param position The current hover position.
     */
    const references = async (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<sourcegraph.Location[]> => {
        const contentAndToken = await getContentAndToken(doc, pos)
        if (!contentAndToken) {
            return []
        }
        const { searchToken } = contentAndToken

        const queries = referencesQueries({
            searchToken,
            doc,
            fileExts,
            isSourcegraphDotCom: isSourcegraphDotCom(),
        })

        // Perform all search queries concurrently, then merge and sort
        // the results based on the proximity to the current file.
        const searchResults = await Promise.all(queries.map(search))
        const mergedResults = flatten(searchResults).map(resultToLocation)
        return sortByProximity(mergedResults, new URL(doc.uri))
    }

    /**
     * Retrieve hover tex for the current hover position.
     *
     * @param doc The current text document.
     * @param position The current hover position.
     */
    const hover = async (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<sourcegraph.Hover | null> => {
        const text = await getFileContent(doc)
        if (!text) {
            return null
        }

        // Get the first definition and ensure it has a range
        const def = asArray(await definition(doc, pos))[0]
        if (!def || !def.range) {
            return null
        }

        // Get the definition line
        const line = text.split('\n')[def.range.start.line]
        if (!line) {
            return null
        }

        // Clean up the line by removing punctuation from the right end
        const trimmedLine = line.trim().replace(/[:;=,{(<]+$/, '')

        if (trimmedLine.includes('```')) {
            // Don't render the line if it breaks out of the Markdown
            // block that wraps content in the web UI.
            return null
        }

        // Render the line as syntax-highlighted Markdown
        const codeLineMarkdown =
            '```' + languageID + '\n' + trimmedLine + '\n```'

        const docstring = findDocstring({
            definitionLine: def.range.start.line,
            fileText: text,
            commentStyle,
            docstringIgnore,
        })

        const docstringMarkdown =
            docstring && wrapIndentationInCodeBlocks(languageID, docstring)

        return {
            contents: {
                kind: sourcegraph.MarkupKind.Markdown,
                value: [codeLineMarkdown, docstringMarkdown]
                    .filter(isDefined)
                    .join('\n\n---\n\n'),
            },
        }
    }

    return {
        definition: asyncGeneratorFromPromise(definition),
        references: asyncGeneratorFromPromise(references),
        hover: asyncGeneratorFromPromise(hover),
    }
}

/**
 * Retrieve the text of the current text document. This may be cached on the text
 * document itself. If it's not, we fetch it from the Raw API.
 *
 * @param doc The current text document.
 */
function getFileContent(
    doc: sourcegraph.TextDocument
): Promise<string | undefined> {
    if (doc.text) {
        return Promise.resolve(doc.text)
    }
    const { repo, commit, path } = parseGitURI(new URL(doc.uri))
    return getFileContentFromApi(repo, commit, path)
}

/**
 * Perform a search query.
 *
 * @param query The search query.
 */
async function search(query: string): Promise<Result[]> {
    if (shouldTraceSearch()) {
        console.log('%cSearch', 'font-weight:bold;', {
            query,
        })
    }

    return (await searchViaApi(query, shouldRequestFileLocal())).flatMap(
        searchResultToResults
    )
}

/**
 * Sort the locations by their uri field's similarity to the current text
 * document URI. This is done by applying a similarity coefficient to the
 * segments of each file path. Paths with more segments in common will
 * have a higher similarity coefficient.
 *
 * @param locations A list of locations to sort.
 * @param currentURI The URI of the current text document.
 */
function sortByProximity(
    locations: sourcegraph.Location[],
    currentURI: URL
): sourcegraph.Location[] {
    return sortBy(
        locations,
        ({ uri }) =>
            -jaccardIndex(
                new Set(uri.hash.slice(1).split('/')),
                new Set(currentURI.hash.slice(1).split('/'))
            )
    )
}

/**
 * Calculate the jaccard index, or the Intersection over Union of two sets.
 *
 * @param a The first set.
 * @param b The second set.
 */
function jaccardIndex<T>(a: Set<T>, b: Set<T>): number {
    return (
        // Get the size of the intersection
        new Set([...Array.from(a)].filter(value => b.has(value))).size /
        // Get the size of the union
        new Set([...Array.from(a), ...Array.from(b)]).size
    )
}

/**
 * Return true if the current Sourcegraph instance is DotCom.
 */
function isSourcegraphDotCom(): boolean {
    return (
        sourcegraph.internal.sourcegraphURL.href === 'https://sourcegraph.com/'
    )
}

/**
 * Return true if searches should be traced in the console.
 */
function shouldTraceSearch(): boolean {
    return !!sourcegraph.configuration
        .get<Settings>()
        .get('basicCodeIntel.debug.traceSearch')
}

/**
 * Return true if `fileLocal` is configured in the settings.
 */
function shouldRequestFileLocal(): boolean {
    return sourcegraph.configuration.get<Settings>().get('fileLocal') || false
}
