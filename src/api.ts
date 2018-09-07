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

export class API {
    private browserIncludesCookie: Promise<boolean>

    constructor(private traceSearch: boolean, private token: string) {
        this.browserIncludesCookie = this.search('test', true).then(
            res => {
                if (traceSearch) {
                    console.log('Detected browser includes session cookie')
                }
                return true
            },
            reason => {
                if (traceSearch) {
                    console.log(
                        'Detected browser does not include session cookie'
                    )
                }
                return false
            }
        )
    }

    /**
     * search returns the list of results fetched from the Sourcegraph search API.
     */
    async search(
        searchQuery: string,
        noAuthToken?: boolean
    ): Promise<Result[]> {
        if (this.traceSearch) {
            console.log('%c' + 'Search', 'font-weight:bold;', {
                query: searchQuery,
            })
        }

        const headers = new Headers()
        const includeAuthTok =
            !noAuthToken && !(await this.browserIncludesCookie)
        if (includeAuthTok && this.token.length > 0) {
            headers.append('Authorization', `token ${this.token}`)
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

        const sourcegraphOrigin = self.location.origin
        const resp = await fetch(sourcegraphOrigin + '/.api/graphql?Search', {
            method: 'POST',
            mode: 'cors',
            headers,
            body: `{"query": ${JSON.stringify(
                graphqlQuery
            )}, "variables": ${JSON.stringify(graphqlVars)}}`,
        })
        if (!resp.ok) {
            throw new Error(
                'Response error:' + resp.status + ' ' + resp.statusText
            )
        }
        const respObj = await resp.json()

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
                        })
                    }
                }
            }
        }
        return results
    }
}
