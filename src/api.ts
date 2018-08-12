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
    headers.append('Authorization', 'token 6829f551c841f63f68be1b94405b3ca438fba994')
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
    const graphqlVars = { query: `type:file ${searchQuery}` }

    const resp = await fetch('http://localhost:3080/.api/graphql?Search', {
        method: 'POST',
        mode: 'cors',
        headers,
        body: `{"query": ${JSON.stringify(graphqlQuery)}, "variables": ${JSON.stringify(graphqlVars)}}`,
        // body: '{"query": "query { currentUser { username } }"}',
    })
    const respObj = await resp.json()
    // console.log('# resp', respObj)
    // console.log('# respObj', respObj.data.search.results.results)
    const results = []
    for (const result of respObj.data.search.results.results) {
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
