import * as sourcegraph from 'sourcegraph'
import { API, Result, parseUri } from './api'
import * as sprintf from 'sprintf-js'
import { takeWhile, dropWhile } from 'lodash'

/**
 * identCharPattern is used to match identifier tokens
 */
const identCharPattern = /[A-Za-z0-9_\-']/

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

type Scope =
    | 'current file'
    | 'current repository'
    | 'all repositories'
    | 'other repositories'

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
        case 'current file':
            terms.push(`repo:^${repo}$@${rev}`)
            terms.push(`file:^${path}$`)
            break
        case 'current repository':
            terms.push(`repo:^${repo}$@${rev}`)
            break
        case 'all repositories':
            break
        case 'other repositories':
            terms.push(`-repo:^${repo}$`)
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

function findSearchToken({
    text,
    position,
    lineRegex,
}: {
    text: string
    position: sourcegraph.Position
    lineRegex?: RegExp
}): { searchToken: string; isComment: boolean } | undefined {
    const lines = text.split('\n')
    const line = lines[position.line]
    let end = line.length
    for (let c = position.character; c < line.length; c++) {
        if (!identCharPattern.test(line[c])) {
            end = c
            break
        }
    }
    let start = 0
    for (let c = position.character; c >= 0; c--) {
        if (!identCharPattern.test(line[c])) {
            start = c + 1
            break
        }
    }
    if (start >= end) {
        return undefined
    }
    const searchToken = line.substring(start, end)
    if (!lineRegex) {
        return { searchToken, isComment: false }
    }
    const match = line.match(lineRegex)
    return {
        searchToken,
        isComment:
            ((match && match.index! <= start) || false) &&
            !new RegExp(`('|"|\`)${searchToken}('|"|\`)`).test(line) &&
            !new RegExp(`${searchToken}\\(`).test(line) &&
            !new RegExp(`\\.${searchToken}`).test(line),
    }
}

function takeWhileInclusive<T>(array: T[], predicate: (t: T) => boolean): T[] {
    const index = array.findIndex(value => !predicate(value))
    return index === -1 ? array : array.slice(0, index + 1)
}

export function wrapIndentationInCodeBlocks({
    languageID,
    docstring,
}: {
    languageID: string
    docstring: string
}): string {
    if (
        /```/.test(docstring) ||
        /<\//.test(docstring) ||
        /^(1\.|- |\* )/m.test(docstring)
    ) {
        // It's already formatted, or it has numbered or bulleted lists that
        // would get messed up by this function
        return docstring
    }

    type LineKind = 'prose' | 'code'
    function kindOf(line: string): LineKind | undefined {
        return (
            (/^(  |>).*[^\s]/.test(line) && 'code') ||
            (/^[^\s]/.test(line) && 'prose') ||
            undefined
        )
    }

    const unknownLines = docstring
        .split('\n')
        .map(line => ({ line, kind: kindOf(line) }))

    function propagateProse(lines: typeof unknownLines): void {
        lines.reduce(
            (s, line) => {
                if (line.kind === undefined && s === 'prose') {
                    line.kind = 'prose'
                }
                return line.kind
            },
            'prose' as LineKind | undefined
        )
    }

    propagateProse(unknownLines)
    propagateProse(unknownLines.slice().reverse())
    const knownLines: { line: string; kind: LineKind }[] = unknownLines.map(
        line => ({
            line: line.line,
            kind: line.kind === undefined ? 'code' : line.kind,
        })
    )

    let resultLines: string[] = []
    for (let i = 0; i < knownLines.length; i++) {
        const currentLine = knownLines[i]
        const nextLine = knownLines[i + 1]
        resultLines.push(currentLine.line)
        if (nextLine !== undefined) {
            if (currentLine.kind === 'prose' && nextLine.kind === 'code') {
                resultLines.push('```' + languageID)
            } else if (
                currentLine.kind === 'code' &&
                nextLine.kind === 'prose'
            ) {
                resultLines.push('```')
            }
        } else if (currentLine.kind === 'code') {
            resultLines.push('```')
        }
    }
    return resultLines.join('\n')
}

/**
 * @see package.json contributes.configuration section for the configuration schema.
 */
export interface Settings {
    ['basicCodeIntel.definition.crossRepository']?: boolean
    ['basicCodeIntel.debug.traceSearch']?: boolean
}

interface BlockCommentStyle {
    /**
     * Matches the start of a block comment. C++ example: `/\/\*\*?/`
     */
    startRegex: RegExp
    /**
     * Matches the noise at the beginning of each line in a block comment after
     * the start, end, and leading indentation have been stripped. C++ example:
     * `/(\s\*\s?)?/`
     */
    lineNoiseRegex?: RegExp
    /**
     * Matches the end of a block comment. C++ example: `/\*\//`
     */
    endRegex: RegExp
}

export type CommentStyle = {
    /**
     * Specifies where documentation is placed relative to the definition.
     * Defaults to `'above the definition'`. In Python, documentation is placed
     * `'below the definition'`.
     */
    docPlacement?: 'above the definition' | 'below the definition'

    /**
     * Captures the content of a line comment. Also prevents jump-to-definition
     * (except when the token appears to refer to code). Python example:
     * `/#\s?(.*)/`
     */
    lineRegex?: RegExp
    block?: BlockCommentStyle
}

export interface HandlerArgs {
    /**
     * Used to label markdown code blocks.
     */
    languageID: string
    /**
     * The part of the filename after the `.` (e.g. `cpp` in `main.cpp`).
     */
    fileExts?: string[]
    /**
     * Format strings which, when passed a token, return regexes that match
     * lines where that token is defined (e.g. `const %s =`). Sourcegraph's
     * search interprets literal whitespace ` ` in the query as a wildcard `.*`,
     * so to get around that you need to use `\s` in your regexes instead (e.g
     * `const\s%s\s=`).
     *
     * TODO: replace whitespace on the fly so this warning isn't necessary.
     */
    definitionPatterns?: string[]
    /**
     * Regex that matches lines between a definition and the docstring that
     * should be ignored. Java example: `/^\s*@/` for annotations.
     */
    docstringIgnore?: RegExp
    commentStyle?: CommentStyle
}

export class Handler {
    /**
     * api holds a reference to a Sourcegraph API client.
     */
    public api = new API()
    public languageID: string = ''
    public fileExts: string[] = []
    public definitionPatterns: string[] = []
    public commentStyle: CommentStyle | undefined
    public docstringIgnore: RegExp | undefined

    /**
     * Constructs a new Handler that provides code intelligence on files with the given
     * file extensions.
     */
    constructor({
        languageID,
        fileExts = [],
        definitionPatterns = [],
        commentStyle,
        docstringIgnore,
    }: HandlerArgs) {
        this.languageID = languageID
        this.fileExts = fileExts
        this.definitionPatterns = definitionPatterns
        this.commentStyle = commentStyle
        this.docstringIgnore = docstringIgnore
    }

    /**
     * Returns whether or not a line is a comment.
     */
    isComment(line: string): boolean {
        return Boolean(
            this.commentStyle &&
                this.commentStyle.lineRegex &&
                this.commentStyle.lineRegex.test(line)
        )
    }

    findDocstring({
        definitionLine,
        fileText,
    }: {
        definitionLine: number
        fileText: string
    }): string | undefined {
        const commentStyle = this.commentStyle
        const docstringIgnore = this.docstringIgnore

        if (!commentStyle) {
            return undefined
        }

        function findDocstringInLineComments({
            lineRegex,
            lines,
        }: {
            lineRegex: RegExp
            lines: string[]
        }): string[] | undefined {
            const docLines = takeWhile(
                dropWhile(lines, line =>
                    docstringIgnore ? docstringIgnore.test(line) : false
                ),
                line => new RegExp(/^\s*/.source + lineRegex.source).test(line)
            ).map(line =>
                line.replace(new RegExp(/^\s*/.source + lineRegex.source), '')
            )
            return docLines.length > 0 ? docLines : undefined
        }

        function findDocstringInBlockComment({
            block: { startRegex, lineNoiseRegex, endRegex },
            lines,
        }: {
            block: BlockCommentStyle
            lines: string[]
        }): string[] | undefined {
            // ⚠️ Local mutation
            lines = lines.slice()
            lines = dropWhile(lines, line =>
                docstringIgnore ? docstringIgnore.test(line) : false
            )
            if (!lines[0] || !startRegex.test(lines[0])) {
                return undefined
            }
            lines[0] = lines[0].replace(startRegex, '')
            return takeWhileInclusive(lines, line => !endRegex.test(line))
                .map(line => line.replace(endRegex, ''))
                .map(line => {
                    const indentation = lines[0].match(/^\s*/)![0].length
                    return line.replace(new RegExp(`^\\s{${indentation}}`), '')
                })
                .map(line => {
                    if (lineNoiseRegex) {
                        return line.replace(lineNoiseRegex, '')
                    } else {
                        return line
                    }
                })
        }

        function inlineComment(line: string): string[] | undefined {
            const lineMatch =
                (commentStyle &&
                    commentStyle.lineRegex &&
                    line.match(commentStyle.lineRegex)) ||
                undefined
            const blockMatch =
                (commentStyle &&
                    commentStyle.block &&
                    line.match(
                        // This nasty regex matches an inline block comment by
                        // using a trick from
                        // https://stackoverflow.com/a/3850095/2061958
                        new RegExp(
                            commentStyle.block.startRegex.source +
                                '((?:(?!' +
                                commentStyle.block.endRegex.source +
                                ').)*)' +
                                commentStyle.block.endRegex.source
                        )
                    )) ||
                undefined
            return (
                (lineMatch && [lineMatch[1]]) || (blockMatch && [blockMatch[1]])
            )
        }

        const mungeLines: (lines: string[]) => string[] =
            commentStyle.docPlacement === 'below the definition'
                ? lines => lines.slice(definitionLine + 1)
                : lines => lines.slice(0, definitionLine).reverse()
        const unmungeLines: (lines: string[]) => string[] =
            commentStyle.docPlacement === 'below the definition'
                ? lines => lines
                : lines => lines.reverse()
        const block: BlockCommentStyle | undefined =
            commentStyle.block &&
            (commentStyle.docPlacement === 'below the definition'
                ? commentStyle.block
                : {
                      ...commentStyle.block,
                      startRegex: commentStyle.block.endRegex,
                      endRegex: commentStyle.block.startRegex,
                  })

        const allLines = fileText.split('\n')

        const docLines =
            inlineComment(allLines[definitionLine]) ||
            (commentStyle.lineRegex &&
                findDocstringInLineComments({
                    lineRegex: commentStyle.lineRegex,
                    lines: mungeLines(allLines),
                })) ||
            (block &&
                findDocstringInBlockComment({
                    block,
                    lines: mungeLines(allLines),
                }))

        return docLines && unmungeLines(docLines).join('\n')
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
        const codeLineMarkdown = '```' + this.languageID + '\n' + line + '\n```'

        const docstring = this.findDocstring({
            definitionLine: def.range.start.line,
            fileText: content,
        })

        return {
            contents: {
                kind: sourcegraph.MarkupKind.Markdown,
                value: [
                    docstring &&
                        wrapIndentationInCodeBlocks({
                            languageID: this.languageID,
                            docstring,
                        }),
                    codeLineMarkdown,
                ]
                    .filter(tooltip => tooltip)
                    .join('\n\n---\n\n'),
            },
        }
    }

    async definition(
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ): Promise<sourcegraph.Location[] | null> {
        const tokenResult = findSearchToken({
            text: doc.text,
            position: pos,
            lineRegex: this.commentStyle && this.commentStyle.lineRegex,
        })
        if (!tokenResult) {
            return null
        }
        if (tokenResult.isComment) {
            return null
        }
        const searchToken = tokenResult.searchToken

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
            patternQuery('current file', this.definitionPatterns),
            makeQuery({
                searchToken: `\\b${searchToken}\\b`,
                searchType: 'symbol',
                currentFileUri: doc.uri,
                scope: 'current repository',
                fileExts: this.fileExts,
            }),
            patternQuery('current repository', this.definitionPatterns),
            patternQuery('all repositories', this.definitionPatterns),
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
        const tokenResult = findSearchToken({
            text: doc.text,
            position: pos,
            lineRegex: this.commentStyle && this.commentStyle.lineRegex,
        })
        if (!tokenResult) {
            return null
        }
        const searchToken = tokenResult.searchToken

        const referencesFrom = async (
            scope: Scope
        ): Promise<sourcegraph.Location[]> =>
            (await this.api.search(
                makeQuery({
                    searchToken,
                    searchType: 'file',
                    currentFileUri: doc.uri,
                    scope,
                    fileExts: this.fileExts,
                })
            )).map(resultToLocation)

        return [
            ...(await referencesFrom('current repository')),
            ...(await referencesFrom('other repositories')),
        ]
    }
}
