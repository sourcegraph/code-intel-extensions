import { API, Result, parseUri } from './api'
import { takeWhile, dropWhile, sortBy, flatten, omit } from 'lodash'
import { Location, Position, TextDocument, Hover } from 'sourcegraph'
import { CommentStyle, BlockCommentStyle } from './comments'

export interface HandlerArgs {
    /**
     * Used to label markdown code blocks.
     */
    languageID: string
    /**
     * The part of the filename after the `.` (e.g. `cpp` in `main.cpp`).
     */
    fileExts: string[]
    /**
     * Regex that matches lines between a definition and the docstring that
     * should be ignored. Java example: `/^\s*@/` for annotations.
     */
    docstringIgnore?: RegExp
    commentStyle?: CommentStyle
    /**
     * Regex that matches characters in an identifier.
     */
    identCharPattern?: RegExp
    sourcegraph: typeof import('sourcegraph')
    /**
     * Callback that filters the given symbol search results (e.g. to drop
     * results from non-imported files).
     */
    filterDefinitions?: FilterDefinitions
}

export type FilterDefinitions = (args: {
    repo: string
    rev: string
    filePath: string
    fileContent: string
    pos: Position
    results: Result[]
}) => Result[]

export class Handler {
    /**
     * api holds a reference to a Sourcegraph API client.
     */
    public sourcegraph: typeof import('sourcegraph')
    public api: API
    public languageID: string = ''
    public fileExts: string[] = []
    public commentStyle: CommentStyle | undefined
    public identCharPattern: RegExp | undefined
    public docstringIgnore: RegExp | undefined
    public debugAnnotatedURIs: string[]
    public filterDefinitions: FilterDefinitions

    /**
     * Constructs a new Handler that provides code intelligence on files with the given
     * file extensions.
     */
    constructor({
        languageID,
        fileExts = [],
        commentStyle,
        identCharPattern,
        docstringIgnore,
        sourcegraph,
        filterDefinitions: filterDefinitions = ({ results }) => results,
    }: HandlerArgs) {
        this.sourcegraph = sourcegraph
        this.api = new API(sourcegraph)
        this.languageID = languageID
        this.fileExts = fileExts
        this.commentStyle = commentStyle
        this.identCharPattern = identCharPattern
        this.docstringIgnore = docstringIgnore
        this.debugAnnotatedURIs = []
        this.filterDefinitions = filterDefinitions
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

    async definition(
        doc: TextDocument,
        pos: Position
    ): Promise<Location[] | null> {
        const fileContent = await this.api.getFileContent(
            new this.sourcegraph.Location(new URL(doc.uri))
        )
        if (!fileContent) {
            return null
        }

        const tokenResult = findSearchToken({
            text: fileContent,
            position: pos,
            lineRegex: this.commentStyle && this.commentStyle.lineRegex,
            identCharPattern: this.identCharPattern,
        })
        if (!tokenResult) {
            return null
        }
        if (tokenResult.isComment) {
            return null
        }
        const searchToken = tokenResult.searchToken

        for (const query of definitionQueries({
            searchToken,
            doc,
            fileExts: this.fileExts,
            isSourcegraphDotCom:
                this.sourcegraph.internal.sourcegraphURL.href ===
                'https://sourcegraph.com/',
        })) {
            const symbolResults = this.filterDefinitions({
                ...repoRevFilePath(doc.uri),
                pos,
                fileContent,
                results: (await this.api.search(query)).filter(
                    result =>
                        !result.fileLocal ||
                        result.file ===
                            new URL(doc.uri).hash.replace(/^#/, '') ||
                        // https://github.com/universal-ctags/ctags/issues/1844
                        (doc.languageId === 'java' &&
                            result.symbolKind === 'ENUMMEMBER')
                ),
            }).map(result =>
                resultToLocation({ result, sourcegraph: this.sourcegraph })
            )

            if (symbolResults.length > 0) {
                return sortByProximity({
                    currentLocation: doc.uri,
                    locations: symbolResults,
                })
            }
        }

        return []
    }

    async references(doc: TextDocument, pos: Position): Promise<Location[]> {
        if (doc.text === undefined) {
            return []
        }
        const tokenResult = findSearchToken({
            text: doc.text,
            position: pos,
            lineRegex: this.commentStyle && this.commentStyle.lineRegex,
            identCharPattern: this.identCharPattern,
        })
        if (!tokenResult) {
            return []
        }
        const searchToken = tokenResult.searchToken

        return sortByProximity({
            currentLocation: doc.uri,
            locations: flatten(
                await Promise.all(
                    referencesQueries({
                        searchToken,
                        doc,
                        fileExts: this.fileExts,
                        isSourcegraphDotCom:
                            this.sourcegraph.internal.sourcegraphURL.href ===
                            'https://sourcegraph.com/',
                    }).map(query => this.api.search(query))
                )
            ).map(result =>
                resultToLocation({ result, sourcegraph: this.sourcegraph })
            ),
        })
    }

    /**
     * Return the first definition location's line.
     */
    async hover(doc: TextDocument, pos: Position): Promise<Hover | null> {
        if (this.sourcegraph.configuration.get().get('codeintel.debug')) {
            this.debugAnnotate(doc)
        }

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

        const docstring = findDocstring({
            definitionLine: def.range.start.line,
            fileText: content,
            commentStyle: this.commentStyle,
            docstringIgnore: this.docstringIgnore,
        })

        return {
            contents: {
                kind: this.sourcegraph.MarkupKind.Markdown,
                value: [
                    codeLineMarkdown,
                    docstring &&
                        wrapIndentationInCodeBlocks({
                            languageID: this.languageID,
                            docstring,
                        }),
                ]
                    .filter(tooltip => tooltip)
                    .join('\n\n---\n\n'),
            },
        }
    }

    /**
     * Highlights lines that contain symbol definitions in red.
     */
    async debugAnnotate(doc: TextDocument): Promise<void> {
        if (this.debugAnnotatedURIs.includes(doc.uri)) {
            return
        }
        this.debugAnnotatedURIs.push(doc.uri)
        setTimeout(async () => {
            const editor = this.sourcegraph.app.activeWindow
                ? this.sourcegraph.app.activeWindow.visibleViewComponents[0]
                : undefined
            if (!editor) {
                console.log('NO EDITOR')
            } else {
                const { repo, rev, path } = parseUri(new URL(doc.uri))

                // ^ matches everything (can't leave out a query)
                const r = await this.api.search(
                    `repo:^${repo}$@${rev} count:1000 file:${path} type:symbol ^`
                )
                editor.setDecorations(
                    this.sourcegraph.app.createDecorationType(),
                    r.map(v => ({
                        range: new this.sourcegraph.Range(
                            v.start.line,
                            0,
                            v.end.line,
                            0
                        ), // -1 because lines are 0 indexed
                        border: 'solid',
                        borderWidth: '0 0 0 10px',
                        borderColor: 'red',
                        backgroundColor: 'hsla(0,100%,50%, 0.05)',
                        after: {
                            contentText: `    ${JSON.stringify(
                                omit(v, 'repo', 'rev', 'start', 'end', 'file')
                            )}`,
                        },
                    }))
                )
            }
        }, 500)
    }
}

/**
 * The default regex for characters allowed in an identifier. It works well for
 * C-like languages (C/C++, C#, Java, etc.) but not for languages that allow
 * punctuation characters (e.g. Ruby).
 */
const DEFAULT_IDENT_CHAR_PATTERN = /[A-Za-z0-9_]/

export function findSearchToken({
    text,
    position,
    lineRegex,
    identCharPattern,
}: {
    text: string
    position: { line: number; character: number }
    lineRegex?: RegExp
    identCharPattern?: RegExp
}): { searchToken: string; isComment: boolean } | undefined {
    identCharPattern = identCharPattern || DEFAULT_IDENT_CHAR_PATTERN
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

export function definitionQueries({
    searchToken,
    doc,
    fileExts,
    isSourcegraphDotCom,
}: {
    searchToken: string
    doc: TextDocument
    fileExts: string[]
    isSourcegraphDotCom: boolean
}): string[] {
    const queryIn = (scope: Scope): string =>
        makeQuery({
            searchToken: `^${searchToken}$`,
            searchType: 'symbol',
            currentFileUri: doc.uri,
            scope,
            fileExts,
        })
    return [
        queryIn('current repository'),
        ...(isSourcegraphDotCom ? [] : [queryIn('all repositories')]),
    ]
}

export function referencesQueries({
    searchToken,
    doc,
    fileExts,
    isSourcegraphDotCom,
}: {
    searchToken: string
    doc: TextDocument
    fileExts: string[]
    isSourcegraphDotCom: boolean
}): string[] {
    const from = (scope: Scope): string =>
        makeQuery({
            searchToken: `\\b${searchToken}\\b`,
            searchType: 'file',
            currentFileUri: doc.uri,
            scope,
            fileExts,
        })

    return [
        from('current repository'),
        ...(isSourcegraphDotCom ? [] : [from('other repositories')]),
    ]
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

    const { repo, rev, path } = parseUri(new URL(currentFileUri))
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
        return `file:\\.(${fileExts.join('|')})$`
    }
    return ''
}

/**
 * Extracts the components of a TextDocument.uri like:
 *
 * git://github.com/Microsoft/vscode?5688d00dd592a165530a82945c4ade4dad6b01e7#extensions/css-language-features/server/src/pathCompletion.ts
 *
 * into its `{ repo, rev, filePath }` components.
 */
function repoRevFilePath(
    uri: string
): { repo: string; rev: string; filePath: string } {
    const url = new URL(uri)
    return {
        repo: url.hostname + url.pathname,
        rev: url.search.slice(1),
        filePath: url.hash.slice(1),
    }
}

/**
 * resultToLocation maps a search result to a LSP Location instance.
 */
function resultToLocation({
    result,
    sourcegraph,
}: {
    result: Result
    sourcegraph: typeof import('sourcegraph')
}): Location {
    const rev = result.rev ? result.rev : 'HEAD'
    return {
        uri: new sourcegraph.URI(`git://${result.repo}?${rev}#${result.file}`),
        range: new sourcegraph.Range(
            result.start.line,
            result.start.character,
            result.end.line,
            result.end.character
        ),
    }
}

export function findDocstring({
    definitionLine,
    fileText,
    commentStyle,
    docstringIgnore,
}: {
    definitionLine: number
    fileText: string
    commentStyle?: CommentStyle
    docstringIgnore?: RegExp
}): string | undefined {
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
                return line.replace(new RegExp(`^\\s{0,${indentation}}`), '')
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
        return (lineMatch && [lineMatch[1]]) || (blockMatch && [blockMatch[1]])
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
        lines.reduce((s, line) => {
            if (line.kind === undefined && s === 'prose') {
                line.kind = 'prose'
            }
            return line.kind
        }, 'prose' as LineKind | undefined)
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
        resultLines.push(currentLine.line)
        if (i + 1 < knownLines.length) {
            const nextLine = knownLines[i + 1]
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

function sortByProximity({
    currentLocation,
    locations,
}: {
    currentLocation: string
    locations: Location[]
}): Location[] {
    const currentPath = new URL(currentLocation).hash.slice(1)
    return sortBy(locations, (location: Location) => {
        const path = new URL(location.uri.toString()).hash.slice(1)
        return -jaccard(currentPath.split('/'), path.split('/'))
    })
}

function jaccard<T>(a: T[], b: T[]): number {
    const bSet = new Set(b)
    const intersection = new Set(a.filter(value => bSet.has(value)))
    const union = new Set([...a, ...b])
    return intersection.size / union.size
}

function takeWhileInclusive<T>(array: T[], predicate: (t: T) => boolean): T[] {
    const index = array.findIndex(value => !predicate(value))
    return index === -1 ? array : array.slice(0, index + 1)
}
