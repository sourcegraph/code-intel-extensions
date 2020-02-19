import { flatten, sortBy } from 'lodash'
import * as sourcegraph from 'sourcegraph'
import { FilterDefinitions, LanguageSpec } from '../language-specs/spec'
import { Providers } from '../providers'
import {
    getFileContent as getFileContentFromApi,
    search as searchViaApi,
} from '../util/api'
import { asyncGeneratorFromPromise } from '../util/ix'
import { parseGitURI } from '../util/uri'
import { asArray, isDefined } from '../util/util'
import { Result, resultToLocation, searchResultToResults } from './conversion'
import { findDocstring } from './docstrings'
import { wrapIndentationInCodeBlocks } from './markdown'
import { definitionQuery, referencesQuery } from './queries'
import { BasicCodeIntelligenceSettings } from './settings'
import { findSearchToken } from './tokens'

/**
 * Creates providers powered by search-based code intelligence.
 *
 * @param spec The language spec.
 */
export function createProviders({
    languageID,
    fileExts = [],
    commentStyles,
    identCharPattern,
    filterDefinitions = results => results,
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
            lineRegexes: commentStyles
                .map(style => style.lineRegex)
                .filter(isDefined),
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
        const { repo, commit, path } = parseGitURI(new URL(doc.uri))

        // Construct base definition query without scoping terms
        const query = definitionQuery({ searchToken, doc, fileExts })

        // Perform a search in the current git tree
        const sameRepoDefinitions = searchWithFallback(
            searchAndFilterDefinitions,
            {
                doc,
                repo,
                commit,
                path,
                text,
                filterDefinitions,
                query,
            }
        )

        // Perform an indexed search over all repositories. Do not do this
        // on the DotCom instance as we are unlikely to have indexed the
        // relevant definition and we'd end up jumping to what would seem
        // like a random line of code.
        const anyRepoDefinitions = isSourcegraphDotCom()
            ? Promise.resolve([])
            : searchAndFilterDefinitions({
                  doc,
                  repo,
                  path,
                  text,
                  filterDefinitions,
                  query,
              })

        // Return any local location definitions first
        const results = await sameRepoDefinitions
        if (results.length > 0) {
            return results
        }

        // Fallback to definitions found in any other repository
        return await anyRepoDefinitions
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
        const { repo, commit } = parseGitURI(new URL(doc.uri))

        // Construct base references query without scoping terms
        const query = referencesQuery({ searchToken, doc, fileExts })

        // Perform a search in the current git tree
        const sameRepoReferences = searchWithFallback(searchReferences, {
            repo,
            commit,
            query,
        })

        // Perform an indexed search over all _other_ repositories. This
        // query is ineffective on DotCom as we do not keep repositories
        // in the index permanently.
        const otherRepoReferences = isSourcegraphDotCom()
            ? Promise.resolve([])
            : searchReferences({ query: `${query} -repo:^${repo}$` })

        // Resolve then merge all references and sort them by proximity
        // to the current text document path.
        const referenceChunk = [sameRepoReferences, otherRepoReferences]
        const mergedReferences = flatten(await Promise.all(referenceChunk))
        return sortByProximity(mergedReferences, new URL(doc.uri))
    }

    /**
     * Retrieve hover text for the current hover position.
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
            commentStyles,
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
 * Perform a search query for definitions. Returns results converted to locations,
 * filtered by the language's definition filter, and sorted by proximity to the
 * current text document path.
 *
 * @param args Parameter bag.
 */
async function searchAndFilterDefinitions({
    doc,
    repo,
    path,
    text,
    filterDefinitions,
    query,
}: {
    /** The current text document. */
    doc: sourcegraph.TextDocument
    /** The repository containing the current text document. */
    repo: string
    /** The path of the current text document. */
    path: string
    /** The content of the current text document */
    text: string
    /** The function used to filter definitions. */
    filterDefinitions: FilterDefinitions
    /** The search query. */
    query: string
}): Promise<sourcegraph.Location[]> {
    // Perform search and perform pre-filtering before passing it
    // off to the language spec for the proper filtering pass.
    const searchResults = await search(query)
    const preFilteredResults = searchResults.filter(
        result => !isExternalPrivateSymbol(doc, path, result)
    )

    // Filter results based on language spec
    const filteredResults = filterDefinitions(preFilteredResults, {
        repo,
        filePath: path,
        fileContent: text,
    })

    return sortByProximity(
        filteredResults.map(resultToLocation),
        new URL(doc.uri)
    )
}

/**
 * Perform a search query for references. Returns results converted to locations.
 * Results are not sorted in any meaningful way as these results are meant to be
 * merged with other search query results.
 *
 * @param args Parameter bag.
 */
async function searchReferences({
    query,
}: {
    /** The search query. */
    query: string
}): Promise<sourcegraph.Location[]> {
    return (await search(query)).map(resultToLocation)
}

/**
 * Invoke the given search function by modifying the query with a term that will
 * only look in the current git tree by appending a repo filter with the repo name
 * and the current commit.
 *
 * This is likely to timeout on large repos or organizations with monorepos if the
 * current commit is not an indexed commit. Instead of waiting for a timeout, we
 * will start a second index-only search of the HEAD commit for the same repo after
 * a short delay.
 *
 * This function returns the set of results that resolve first.
 *
 * @param search The search function.
 * @param args The arguments to the search function.
 */
export function searchWithFallback<
    P extends { repo: string; commit: string; query: string },
    R
>(search: (args: P) => Promise<R>, args: P): Promise<R> {
    const { repo, commit, query } = args
    const unindexedQuery = `${query} repo:^${repo}$@${commit}`
    const indexedQuery = `${query} repo:^${repo}$ index:only`

    if (getConfig('basicCodeIntel.indexOnly', false)) {
        return search({
            ...args,
            query: indexedQuery,
        })
    }

    const timeout = getConfig<number>(
        'basicCodeIntel.unindexedSearchTimeout',
        5000
    )

    return raceWithDelayOffset(
        search({ ...args, query: unindexedQuery }),
        () => search({ ...args, query: indexedQuery }),
        timeout
    )
}

/**
 * Perform a search query.
 *
 * @param query The search query.
 */
async function search(query: string): Promise<Result[]> {
    if (getConfig('basicCodeIntel.debug.traceSearch', false)) {
        console.log('%cSearch', 'font-weight:bold;', {
            query,
        })
    }

    return (await searchViaApi(query, getConfig('fileLocal', false))).flatMap(
        searchResultToResults
    )
}

/**
 * Report whether the given symbol is both private and does not belong to
 * the current text document.
 *
 * @param doc The current text document.
 * @param path The path of the document.
 * @param result The search result.
 */
function isExternalPrivateSymbol(
    doc: sourcegraph.TextDocument,
    path: string,
    { fileLocal, file, symbolKind }: Result
): boolean {
    // Enum members are always public, but there's an open ctags bug that
    // doesn't let us treat that way.
    // See https://github.com/universal-ctags/ctags/issues/1844

    if (doc.languageId === 'java' && symbolKind === 'ENUMMEMBER') {
        return false
    }

    return !!fileLocal && file !== path
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

/** Retrieves a config value by key. */
function getConfig<T>(key: string, defaultValue: T): T {
    const configuredValue = sourcegraph.configuration
        .get<BasicCodeIntelligenceSettings>()
        .get(key)

    return configuredValue || defaultValue
}

/**
 * Race an in-flight promise and a promise that will be invoked only after
 * a timeout. This will favor the primary promise, which should be likely
 * to resolve fairly quickly.
 *
 * This is useful for situations where the primary promise may time-out,
 * and the fallback promise returns a value that is likely to be resolved
 * faster but is not as good of a result. This particular situation should
 * _not_ use Promise.race, as the faster promise will always resolve before
 * the one with better results.
 *
 * @param primary The in-flight happy-path promise.
 * @param fallback A factory that creates a fallback promise.
 * @param timeout The timeout in ms before the fallback is invoked.
 */
export async function raceWithDelayOffset<T>(
    primary: Promise<T>,
    fallback: () => Promise<T>,
    timeout: number
): Promise<T> {
    const results = await Promise.race([primary, delay(timeout)])
    if (results !== undefined) {
        return results
    }

    return await Promise.race([primary, fallback()])
}

/**
 * Create a promise that resolves to undefined after the given timeout.
 *
 * @param timeout The timeout in ms.
 */
async function delay(timeout: number): Promise<undefined> {
    return new Promise(r => setTimeout(r, timeout))
}
