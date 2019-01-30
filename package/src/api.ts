import * as sourcegraph from 'sourcegraph'
import { Settings } from './handler'
import { memoizeAsync } from './memoizeAsync'

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
}

export class API {
    private get traceSearch(): boolean {
        return Boolean(
            sourcegraph.configuration
                .get<Settings>()
                .get('basicCodeIntel.debug.traceSearch')
        )
    }

    /**
     * search returns the list of results fetched from the Sourcegraph search API.
     */
    async search(searchQuery: string): Promise<Result[]> {
        if (this.traceSearch) {
            console.log('%c' + 'Search', 'font-weight:bold;', {
                query: searchQuery,
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
        const graphqlVars = { query: searchQuery }

        const respObj = await queryGraphQL({
            query: graphqlQuery,
            vars: graphqlVars,
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
    async getFileContent(loc: sourcegraph.Location): Promise<string | null> {
        const graphqlQuery = `query GetContextLines($repo: String!, $rev: String!, $path: String!) {
          repository(name: $repo) {
              commit(rev: $rev) {
                file(path: $path) {
                  content
                }
              }
            }
          }`

        const { repo, rev, path } = parseUri(loc.uri.toString())
        const respObj = await queryGraphQL({
            query: graphqlQuery,
            vars: { repo, rev, path },
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
    uri: string
): { repo: string; rev: string; path: string } {
    if (!uri.startsWith('git://')) {
        throw new Error('unexpected uri format: ' + uri)
    }
    const repoRevPath = uri.substr('git://'.length)
    const i = repoRevPath.indexOf('?')
    if (i < 0) {
        throw new Error('unexpected uri format: ' + uri)
    }
    const revPath = repoRevPath.substr(i + 1)
    const j = revPath.indexOf('#')
    if (j < 0) {
        throw new Error('unexpected uri format: ' + uri)
    }
    const path = revPath.substr(j + 1)
    return {
        repo: repoRevPath.substring(0, i),
        rev: revPath.substring(0, j),
        path: path,
    }
}

// TODO(sqs): this will never release the memory of the cached responses; use an LRU cache or similar.
const queryGraphQL = memoizeAsync(
    async ({
        query,
        vars,
    }: {
        query: string
        vars: { [name: string]: any }
    }): Promise<any> => {
        return sourcegraph.commands.executeCommand<any>(
            'queryGraphQL',
            query,
            vars
        )
    },
    arg => JSON.stringify(arg)
)
