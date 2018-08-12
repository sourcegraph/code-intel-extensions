// TODO: copy https://sourcegraph.sgdev.org/github.com/sourcegraph/cx-codecov/-/blob/src/api.ts

export interface SourcegraphConfig {
    baseURL: string
}

export interface Result {
    repo: string
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

export async function fetchSearchResults(searchQuery: string): Promise<Result[]> {
    const headers = new Headers()
    headers.append('Authorization', 'token 6829f551c841f63f68be1b94405b3ca438fba994') // TODO: remove hardcoded token, set from config field
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

    const resp = await fetch('http://localhost:3080/.api/graphql?Search', { // TODO: hardcoded
        method: 'POST',
        mode: 'cors',
        headers,
        body: `{"query": ${JSON.stringify(graphqlQuery)}, "variables": ${JSON.stringify(graphqlVars)}}`,
    })
    const respObj = await resp.json()
    console.log('respObj', respObj)
    const results = []
    for (const result of respObj.data.search.results.results) {
        for (const sym of result.symbols) {
            results.push({
                repo: result.repository.name,
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
