import * as conf from './conf'

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
}

/**
 * fetchSearchResults returns the list of results fetched from the Sourcegraph search API.
 */
export async function fetchSearchResults(token: string, searchQuery: string): Promise<Result[]> {
    if (conf.config.debug.traceSearch) {
        console.log('%c' + 'Search', 'font-weight:bold;', { 'query': searchQuery })
    }

    const headers = new Headers()
    headers.append('Authorization', `token ${token}`)
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

    const sourcegraphOrigin = self.location.origin
    const resp = await fetch(sourcegraphOrigin + '/.api/graphql?Search', {
        method: 'POST',
        mode: 'cors',
        headers,
        body: `{"query": ${JSON.stringify(graphqlQuery)}, "variables": ${JSON.stringify(graphqlVars)}}`,
    })
    let respObj;
    try {
        respObj = await resp.json()
    } catch (e) {
        console.error('Could not fetch search results', e)
        return []
    }
    const results = []
    for (const result of respObj.data.search.results.results) {
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
                        character: offsetAndLength[0] + offsetAndLength[1],
                    },
                })
            }
        }
    }
    return results
}
