import { Location } from 'sourcegraph'
import { Settings } from './settings'
import { queryGraphQL } from '../graphql'

/**
 * Result represents a search result returned from the Sourcegraph API.
 */
export interface Result {
    repo: string
    rev: string
    file: string
    start: {
        line: number
        character: number
    }
    end: {
        line: number
        character: number
    }
    preview?: string // only for text search results
    symbolName?: string
    symbolKind?: string
    containerName?: string
    fileLocal?: boolean
}

export class API {
    constructor(private sourcegraph: typeof import('sourcegraph')) {}

    private get traceSearch(): boolean {
        return Boolean(
            this.sourcegraph.configuration
                .get<Settings>()
                .get('basicCodeIntel.debug.traceSearch')
        )
    }

    /**
     * search returns the list of results fetched from the Sourcegraph search API.
     */
    async search(query: string): Promise<Result[]> {
        const fileLocal =
            this.sourcegraph.configuration.get<Settings>().get('fileLocal') ||
            false

        if (this.traceSearch) {
            console.log('%c' + 'Search', 'font-weight:bold;', {
                query,
            })
        }

        const graphqlQuery = `query Search($query: String!) {
            search(query: $query) {
              results {
                __typename
                limitHit
                results {
                  ... on FileMatch {
                    __typename
                    file {
                      path
                      url
                      commit {
                        oid
                      }
                    }
                    repository {
                      name
                      url
                    }
                    limitHit
                    symbols {
                      name
                      containerName
                      ${fileLocal ? 'fileLocal' : ''}
                      url
                      kind
                      location {
                        resource {
                          path
                        }
                        range {
                          start {
                            line
                            character
                          }
                          end {
                            line
                            character
                          }
                        }
                      }
                    }
                    lineMatches {
                      preview
                      lineNumber
                      offsetAndLengths
                    }
                  }
                }
              }
            }
          }`
        const graphqlVars = { query }

        const respObj = await queryGraphQL({
            query: graphqlQuery,
            vars: graphqlVars,
            sourcegraph: this.sourcegraph,
        })
        const results = []
        for (const result of respObj.data.search.results.results) {
            if (result.symbols) {
                for (const sym of result.symbols) {
                    results.push({
                        repo: result.repository.name,
                        rev: result.file.commit.oid,
                        file: sym.location.resource.path,
                        start: {
                            line: sym.location.range.start.line,
                            character: sym.location.range.start.character,
                        },
                        end: {
                            line: sym.location.range.end.line,
                            character: sym.location.range.end.character,
                        },
                        symbolName: sym.name,
                        symbolKind: sym.kind,
                        containerName: sym.containerName,
                        fileLocal: sym.fileLocal,
                    })
                }
            }
            if (result.lineMatches) {
                for (const lineMatch of result.lineMatches) {
                    for (const offsetAndLength of lineMatch.offsetAndLengths) {
                        results.push({
                            repo: result.repository.name,
                            rev: result.file.commit.oid,
                            file: result.file.path,
                            start: {
                                line: lineMatch.lineNumber,
                                character: offsetAndLength[0],
                            },
                            end: {
                                line: lineMatch.lineNumber,
                                character:
                                    offsetAndLength[0] + offsetAndLength[1],
                            },
                            preview: lineMatch.preview,
                        })
                    }
                }
            }
        }
        return results
    }

    /**
     * Get the text content of a file.
     */
    async getFileContent(loc: Location): Promise<string | null> {
        const graphqlQuery = `query GetContextLines($repo: String!, $rev: String!, $path: String!) {
          repository(name: $repo) {
              commit(rev: $rev) {
                file(path: $path) {
                  content
                }
              }
            }
          }`

        const { repo, rev, path } = parseUri(loc.uri)
        const respObj = await queryGraphQL({
            query: graphqlQuery,
            vars: { repo, rev, path },
            sourcegraph: this.sourcegraph,
        })
        if (
            !respObj ||
            !respObj.data ||
            !respObj.data.repository ||
            !respObj.data.repository.commit
        ) {
            return null
        }
        return respObj.data.repository.commit.file.content
    }
}

export function parseUri(
    uri: URL
): { repo: string; rev: string; path: string } {
    return {
        repo: uri.host + uri.pathname,
        rev: decodeURIComponent(uri.search.slice(1)), // strip the leading ?
        path: decodeURIComponent(uri.hash.slice(1)), // strip the leading #
    }
}
