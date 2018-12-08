import * as sourcegraph from 'sourcegraph'
import { API, Result, parseUri } from './api'

/**
 * identCharPattern is used to match identifier tokens
 */
const identCharPattern = /[A-Za-z0-9_]/

/**
 * fileExtSets describe file extension sets that may contain references to one another.
 * The elements of this array *must* be disjoint sets. Don't refer to this variable directly.
 * Instead, call fileExtTerm.
 */
const fileExtsSets = [
    ['h', 'c', 'hpp', 'cpp', 'm', 'cc'],
    ['java'],
    ['go'],
    ['js'],
    ['ts'],
    ['rb', 'erb'],
    ['py'],
    ['php'],
    ['css'],
    ['cs'],
    ['sh'],
    ['scala'],
    ['erl'],
    ['r'],
    ['swift'],
    ['coffee'],
    ['pl'],
]
const fileExtToTerm = new Map<string, string>()
function initFileExtToTerm() {
    for (const s of fileExtsSets) {
        const extRegExp = `file:\.(${s.join('|')})$`
        for (const e of s) {
            fileExtToTerm.set(e, extRegExp)
        }
    }
}
initFileExtToTerm()

/**
 * Selects documents that the extension works on.
 */
export const DOCUMENT_SELECTOR: sourcegraph.DocumentSelector = fileExtsSets
    .reduce((all, exts) => all.concat(exts), [])
    .map(ext => ({ pattern: `*.${ext}` }))

/**
 * fileExtTerm returns the search term to use to filter to specific file extensions
 */
function fileExtTerm(sourceFile: string): string {
    const i = sourceFile.lastIndexOf('.')
    if (i === -1) {
        return ''
    }
    const ext = sourceFile.substring(i + 1).toLowerCase()
    const match = fileExtToTerm.get(ext)
    if (match) {
        return match
    }
    return ''
}

/**
 * makeQuery returns the search query to use for a given set of options.
 */
function makeQuery(
    searchToken: string,
    symbols: boolean,
    currentFileUri: string,
    local: boolean,
    nonLocal: boolean
): string {
    const terms = [`\\b${searchToken}\\b`, 'case:yes']
    terms.push(fileExtTerm(currentFileUri))
    if (symbols) {
        terms.push('type:symbol')
    } else {
        terms.push('type:file')
    }
    const { repo, rev } = parseUri(currentFileUri)
    if (local) {
        terms.push(`repo:^${repo}$@${rev}`)
    }
    if (nonLocal) {
        terms.push(`-repo:^${repo}$`)
    }
    return terms.join(' ')
}

/**
 * resultToLocation maps a search result to a LSP Location instance.
 */
function resultToLocation(res: Result): sourcegraph.Location {
    const rev = res.rev ? res.rev : 'HEAD'
    return {
        uri: new sourcegraph.URI(`git://${res.repo}?${rev}#${res.file}`),
        range: new sourcegraph.Range(
            res.start.line,
            res.start.character,
            res.end.line,
            res.end.character
        ),
    }
}

/**
 * @see package.json contributes.configuration section for the configuration schema.
 */
export interface Settings {
    ['basicCodeIntel.enabled']?: boolean
    ['basicCodeIntel.definition.symbols']?: 'never' | 'local' | 'always'
    ['basicCodeIntel.hover']?: boolean
    ['basicCodeIntel.debug.traceSearch']?: boolean
}

const COMMENT_PATTERN = /^\s*(\/\/\/?|#|;|"""|\*( |$)|\/\*\*|\*\/$)\s*/

export class Handler {
    /**
     * api holds a reference to a Sourcegraph API client.
     */
    public api = new API()

    /**
     * Return the first definition location's line.
     */
    async hover(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        symbols = sourcegraph.configuration
            .get<Settings>()
            .get('basicCodeIntel.definition.symbols')
    ): Promise<sourcegraph.Hover | null> {
        // Default to usage of symbols (at least 'local'). If 'always' is set, respect that (but don't default to
        // that since it is slower when there are many repositories).
        if (!symbols) {
            symbols = 'local'
        }

        const definitions = await this.definition(doc, pos, symbols, false)
        if (!definitions || definitions.length === 0) {
            return null
        }

        const def = definitions[0]
        if (!def.range) {
            return null
        }

        const content = await this.api.getFileContent(def)
        if (!content) {
            return null
        }
        const lines = content.split('\n')

        // Get the definition's line.
        let line = lines[def.range.start.line]
        if (!line) {
            return null
        }
        // Clean up the line.
        line = line.trim()
        line = line.replace(/[:;=,{(<]+$/, '')
        // Render the line as syntax-highlighted Markdown.
        if (line.includes('```')) {
            // Don't render the line if it would "break out" of the Markdown code block we will wrap it in.
            return null
        }
        const codeLineMarkdown = '```' + doc.languageId + '\n' + line + '\n```'

        // Get lines before/after the definition's line that contain comments.
        const commentsStep = doc.languageId === 'python' ? 1 : -1 // only Python comments come after the definition (docstrings)
        const MAX_COMMENT_LINES = 13
        let commentLines: string[] = []
        for (let i = 0; i < MAX_COMMENT_LINES; i++) {
            const l = def.range.start.line + commentsStep * (i + 1)
            let line = lines[l]
            if (!line) {
                break
            }
            const isComment = COMMENT_PATTERN.test(line)
            if (isComment) {
                // Clean up line.
                line = line.replace(COMMENT_PATTERN, '').trim()
                line = line.replace(/("""|\*\/)$/, '') // clean up block comment terminators and Python docstring terminators
                commentLines[commentsStep > 0 ? 'push' : 'unshift'](line)
            }
        }
        const commentsMarkdown = commentLines.join('\n').trim()

        return {
            contents: {
                kind: sourcegraph.MarkupKind.Markdown,
                value: [commentsMarkdown, codeLineMarkdown]
                    .filter(v => !!v)
                    .join('\n\n---\n\n'),
            },
        }
    }

    async definition(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        symbols = sourcegraph.configuration
            .get<Settings>()
            .get('basicCodeIntel.definition.symbols'),
        textSearchFallbackForSymbols = true
    ): Promise<sourcegraph.Location[] | null> {
        // Default to using local symbols lookup.
        if (!symbols) {
            symbols = 'local'
        }

        const lines = doc.text.split('\n')
        const line = lines[pos.line]
        let end = line.length
        for (let c = pos.character; c < line.length; c++) {
            if (!identCharPattern.test(line[c])) {
                end = c
                break
            }
        }
        let start = 0
        for (let c = pos.character; c >= 0; c--) {
            if (!identCharPattern.test(line[c])) {
                start = c + 1
                break
            }
        }
        if (start >= end) {
            return null
        }
        const searchToken = line.substring(start, end)

        if (symbols === 'always' || symbols === 'local') {
            const symbolResults = this.api.search(
                makeQuery(
                    searchToken,
                    true,
                    doc.uri,
                    symbols === 'local',
                    false
                )
            )
            let results = await symbolResults
            if (results.length === 0 && textSearchFallbackForSymbols) {
                results = await this.api.search(
                    makeQuery(searchToken, false, doc.uri, false, false)
                )

                // Filter out things that are unlikely to be definitions: matches on comment lines, matches that
                // merely are references.
                results = results.filter(result => {
                    if (!result.preview) {
                        return false
                    }
                    const p = result.preview.trim()
                    return (
                        p &&
                        !COMMENT_PATTERN.test(p) &&
                        !p.includes(`new ${searchToken}`) &&
                        !p.includes(`= ${searchToken}`) &&
                        !p.includes(`${searchToken},`) &&
                        !p.includes(`.${searchToken}`) &&
                        !/^\s*(if|while|for|case)\b/.test(p) &&
                        (!p.startsWith(searchToken) || p.includes('=')) &&
                        p.indexOf(searchToken) < 8
                    )
                })
            }

            let locations = results.map(resultToLocation)

            // Filter out locations that are on the same line as the request (ignoring the revision). These might
            // be definitions, but they are not very helpful (since the user is already there), and they are likely
            // to be incorrect.
            const isNotSameLineAsRequestLocation = (
                loc: sourcegraph.Location
            ): boolean => {
                const locURI = parseUri(loc.uri.toString())
                const docURI = parseUri(doc.uri.toString())
                return (
                    locURI.repo !== docURI.repo ||
                    locURI.path !== docURI.path ||
                    (!!loc.range && loc.range.start.line !== pos.line)
                )
            }
            const FILTER_OUT_SAME_LINES = false // temporarily disabled - it actually seems useful
            if (FILTER_OUT_SAME_LINES) {
                locations = locations.filter(isNotSameLineAsRequestLocation)
            }

            return locations
        } else {
            return (await this.api.search(
                makeQuery(searchToken, false, doc.uri, false, false)
            )).map(resultToLocation)
        }
    }

    async references(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<sourcegraph.Location[] | null> {
        const lines = doc.text.split('\n')
        const line = lines[pos.line]
        let end = line.length
        for (let c = pos.character; c < line.length; c++) {
            if (!identCharPattern.test(line[c])) {
                end = c
                break
            }
        }
        let start = 0
        for (let c = pos.character; c >= 0; c--) {
            if (!identCharPattern.test(line[c])) {
                start = c + 1
                break
            }
        }
        if (start >= end) {
            return null
        }
        const searchToken = line.substring(start, end)

        const localResultsPromise = this.api.search(
            makeQuery(searchToken, false, doc.uri, true, false)
        )
        const nonLocalResultsPromise = this.api.search(
            makeQuery(searchToken, false, doc.uri, false, true)
        )

        const results: Result[] = []
        return results
            .concat(await localResultsPromise)
            .concat(await nonLocalResultsPromise)
            .map(resultToLocation)
    }
}
