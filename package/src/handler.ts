import * as sourcegraph from 'sourcegraph'
import { API, Result, parseUri } from './api'
import * as sprintf from 'sprintf-js'

/**
 * identCharPattern is used to match identifier tokens
 */
const identCharPattern = /[A-Za-z0-9_]/

/**
 * Selects documents that the extension works on.
 */
export function documentSelector(
    fileExts: string[]
): sourcegraph.DocumentSelector {
    return fileExts.map(ext => ({ pattern: `*.${ext}` }))
}

/**
 * fileExtTerm returns the search term to use to filter to specific file extensions
 */
function fileExtTerm(sourceFile: string, fileExts: string[]): string {
    const i = sourceFile.lastIndexOf('.')
    if (i === -1) {
        return ''
    }
    const ext = sourceFile.substring(i + 1).toLowerCase()
    const match = fileExts.includes(ext)
    if (match) {
        return `file:\.(${fileExts.join('|')})$`
    }
    return ''
}

type Scope = 'file' | 'repo' | 'all repos'

/**
 * makeQuery returns the search query to use for a given set of options.
 */
function makeQuery({
    searchToken,
    searchType,
    currentFileUri,
    scope,
    fileExts,
}: {
    searchToken: string
    searchType: 'symbol' | 'file'
    currentFileUri: string
    scope: Scope
    fileExts: string[]
}): string {
    const terms = [searchToken, 'case:yes']

    if (
        !currentFileUri.endsWith('.thrift') &&
        !currentFileUri.endsWith('.proto') &&
        !currentFileUri.endsWith('.graphql')
    ) {
        terms.push(fileExtTerm(currentFileUri, fileExts))
    }

    switch (searchType) {
        case 'symbol':
            terms.push('type:symbol')
            break
        case 'file':
            terms.push('type:file')
            break
        default:
            console.error('bad searchType', searchType)
    }

    const { repo, rev, path } = parseUri(currentFileUri)
    switch (scope) {
        case 'file':
            terms.push(`repo:^${repo}$@${rev}`)
            terms.push(`file:^${path}$`)
            break
        case 'repo':
            terms.push(`repo:^${repo}$@${rev}`)
            break
        case 'all repos':
            break
        default:
            console.error('bad scope', scope)
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
    ['basicCodeIntel.definition.crossRepository']?: boolean
    ['basicCodeIntel.debug.traceSearch']?: boolean
}

const COMMENT_PATTERN = /^\s*(\/\/\/?|#|;|"""|\*( |$)|\/\*\*|\*\/$)\s*/

export interface HandlerArgs {
    fileExts?: string[]
    /** %s format strings that return regexes (e.g. `const %s =`). */
    definitionPatterns?: string[]
}

export class Handler {
    /**
     * api holds a reference to a Sourcegraph API client.
     */
    public api = new API()
    public fileExts: string[] = []
    public definitionPatterns: string[] = []

    /**
     * Constructs a new Handler that provides code intelligence on files with the given
     * file extensions.
     */
    constructor({
        fileExts = [],
        /** %s format strings that return regexes (e.g. `const %s =`). */
        definitionPatterns = [],
    }: HandlerArgs) {
        this.fileExts = fileExts
        this.definitionPatterns = definitionPatterns
    }

    /**
     * Return the first definition location's line.
     */
    async hover(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<sourcegraph.Hover | null> {
        const definitions = await this.definition(doc, pos)
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
            priority: -1,
        }
    }

    async definition(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        crossRepo = sourcegraph.configuration
            .get<Settings>()
            .get('basicCodeIntel.definition.crossRepository')
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

        const patternQuery = (
            scope: Scope,
            patterns: string[]
        ): string | undefined => {
            return patterns.length === 0
                ? undefined
                : makeQuery({
                      searchToken: patterns
                          .map(pattern =>
                              sprintf.sprintf(`${pattern}`, searchToken)
                          )
                          .join('|'),
                      searchType: 'file',
                      currentFileUri: doc.uri,
                      scope,
                      fileExts: this.fileExts,
                  })
        }

        const queries = [
            patternQuery('file', this.definitionPatterns),
            makeQuery({
                searchToken: `\\b${searchToken}\\b`,
                searchType: 'symbol',
                currentFileUri: doc.uri,
                scope: 'repo',
                fileExts: this.fileExts,
            }),
            patternQuery('repo', this.definitionPatterns),
            patternQuery('all repos', this.definitionPatterns),
        ].filter((priority): priority is string => Boolean(priority))

        for (const query of queries) {
            const symbolResults = (await this.api.search(query)).map(
                resultToLocation
            )

            if (symbolResults.length > 0) {
                return symbolResults
            }
        }

        return []
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

        return (await this.api.search(
            makeQuery({
                searchToken,
                searchType: 'file',
                currentFileUri: doc.uri,
                scope: 'repo',
                fileExts: this.fileExts,
            })
        )).map(resultToLocation)
    }
}
