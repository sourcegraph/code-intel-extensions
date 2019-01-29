import * as sourcegraph from 'sourcegraph'
import { API, Result, parseUri } from './api'

/**
 * identCharPattern is used to match identifier tokens
 */
const identCharPattern = /[A-Za-z0-9_]/

/**
 * fileExtSets describe file extension sets that may contain references to one
 * another. The contents of this variable are filled in during autogeneration
 * (see generate/). Don't refer to this variable directly. Instead, call
 * fileExtTerm.
 */
const fileExts: string[] = [] // AUTOGENERATE::EXTS
const fileExtToTerm = new Map<string, string>()
function initFileExtToTerm() {
    const extRegExp = `file:\.(${fileExts.join('|')})$`
    for (const e of fileExts) {
        fileExtToTerm.set(e, extRegExp)
    }
}
initFileExtToTerm()

/**
 * Selects documents that the extension works on.
 */
export const DOCUMENT_SELECTOR: sourcegraph.DocumentSelector = fileExts
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
    if (
        !currentFileUri.endsWith('.thrift') &&
        !currentFileUri.endsWith('.proto') &&
        !currentFileUri.endsWith('.graphql')
    ) {
        terms.push(fileExtTerm(currentFileUri))
    }
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
    ['basicCodeIntel.enabled']?: boolean // default true
    ['basicCodeIntel.definition.crossRepository']?: boolean
    ['basicCodeIntel.hover']?: boolean // default true
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

        const symbolResults = this.api.search(
            makeQuery(searchToken, true, doc.uri, !crossRepo, false)
        )
        return (await symbolResults).map(resultToLocation)
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
