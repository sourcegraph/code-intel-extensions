import * as sourcegraph from 'sourcegraph'
import gql from 'tagged-template-noop'
import { graphqlIdToRepoId, queryGraphQL } from './graphql'
import { isDefined, sortUnique } from './helpers'

/**
 * A search result. Each result is for a particular repository and commit, but
 * may have many symbol or indexed/un-indexed search results.
 */
export interface SearchResult {
    repository: {
        name: string
    }
    file: {
        path: string
        commit: {
            oid: string
        }
    }
    symbols: SearchSymbol[]
    lineMatches: LineMatch[]
}

/**
 * A symbol search result.
 */
export interface SearchSymbol {
    name: string
    fileLocal: boolean
    kind: string
    location: {
        resource: { path: string }
        range?: sourcegraph.Range
    }
}

/**
 * An indexed or un-indexed search result.
 */
export interface LineMatch {
    lineNumber: number
    offsetAndLengths: [number, number][]
}

/** Metadata about a resolved repository. */
export interface RepoMeta {
    id: number
    name: string
    isFork: boolean
    isArchived: boolean
}

export class API {
    /** Small never-evict map from repo names to their meta. */
    private cachedMetas = new Map<string, RepoMeta>()
    /**
     * Retrieves the name and fork/archive status of a repository. This method
     * throws an error if the repository is not known to the Sourcegraph instance.
     *
     * @param name The repository's name.
     */
    public async resolveRepo(name: string): Promise<RepoMeta> {
        const cachedMeta = this.cachedMetas.get(name)
        if (cachedMeta !== undefined) {
            return cachedMeta
        }

        const queryWithFork = gql`
            query ResolveRepo($name: String!) {
                repository(name: $name) {
                    id
                    name
                    isFork
                    isArchived
                }
            }
        `

        const queryWithoutFork = gql`
            query ResolveRepo($name: String!) {
                repository(name: $name) {
                    name
                }
            }
        `

        interface Response {
            repository: {
                id: string
                name: string
                isFork?: boolean
                isArchived?: boolean
            }
        }

        const data = await queryGraphQL<Response>((await this.hasForkField()) ? queryWithFork : queryWithoutFork, {
            name,
        })

        // Assume repo is not a fork/archived for older instances
        const meta = { isFork: false, isArchived: false, ...data.repository, id: graphqlIdToRepoId(data.repository.id) }

        this.cachedMetas.set(name, meta)

        return meta
    }

    /**
     * Determines via introspection if the GraphQL API has isFork field on the Repository type.
     *
     * TODO(efritz) - Remove this when we no longer need to support pre-3.15 instances.
     */
    private async hasForkField(): Promise<boolean> {
        const introspectionQuery = gql`
            query RepositoryIntrospection {
                __type(name: "Repository") {
                    fields {
                        name
                    }
                }
            }
        `

        interface IntrospectionResponse {
            __type: { fields: { name: string }[] }
        }

        return (await queryGraphQL<IntrospectionResponse>(introspectionQuery)).__type.fields.some(
            field => field.name === 'isFork'
        )
    }

    /**
     * Retrieves the revhash of an input rev for a repository. Throws an error if the
     * repository is not known to the Sourcegraph instance. Returns undefined if the
     * input rev is not known to the Sourcegraph instance.
     *
     * @param repoName The repository's name.
     * @param rev The revision.
     */
    public async resolveRev(repoName: string, revision: string): Promise<string | undefined> {
        const query = gql`
            query ResolveRev($repoName: String!, $rev: String!) {
                repository(name: $repoName) {
                    commit(rev: $rev) {
                        oid
                    }
                }
            }
        `

        interface Response {
            repository: {
                commit?: {
                    oid: string
                }
            }
        }

        const data = await queryGraphQL<Response>(query, { repoName, rev: revision })
        return data.repository.commit?.oid
    }

    /**
     * Retrieve a sorted and deduplicated list of repository names that contain the
     * given search query.
     *
     * @param searchQuery The input to the search function.
     */
    public async findReposViaSearch(searchQuery: string): Promise<string[]> {
        const query = gql`
            query CodeIntelSearch($query: String!) {
                search(query: $query) {
                    results {
                        results {
                            ... on FileMatch {
                                repository {
                                    name
                                }
                            }
                        }
                    }
                }
            }
        `

        interface Response {
            search: {
                results: {
                    results: {
                        // empty if not a FileMatch
                        repository?: { name: string }
                    }[]
                }
            }
        }

        const data = await queryGraphQL<Response>(query, { query: searchQuery })
        return sortUnique(data.search.results.results.map(result => result.repository?.name)).filter(isDefined)
    }

    /**
     * Retrieve all raw manifests for every extension that exists in the Sourcegraph
     * extension registry.
     */
    public async getExtensionManifests(): Promise<string[]> {
        const query = gql`
            query ExtensionManifests {
                extensionRegistry {
                    extensions {
                        nodes {
                            extensionID
                            manifest {
                                raw
                            }
                        }
                    }
                }
            }
        `

        interface Response {
            extensionRegistry: {
                extensions: {
                    nodes: {
                        manifest?: { raw: string }
                    }[]
                }
            }
        }

        const data = await queryGraphQL<Response>(query)
        return data.extensionRegistry.extensions.nodes.map(extension => extension.manifest?.raw).filter(isDefined)
    }

    /**
     * Retrieve the version of the Sourcegraph instance.
     */
    public async productVersion(): Promise<string> {
        const query = gql`
            query ProductVersion {
                site {
                    productVersion
                }
            }
        `

        interface Response {
            site: {
                productVersion: string
            }
        }

        const data = await queryGraphQL<Response>(query)
        return data.site.productVersion
    }

    /**
     * Retrieve the identifier of the current user.
     *
     * Note: this method does not throw on an unauthenticated request.
     */
    public async getUser(): Promise<string | undefined> {
        const query = gql`
            query CurrentUser {
                currentUser {
                    id
                }
            }
        `

        interface Response {
            currentUser?: { id: string }
        }

        const data = await queryGraphQL<Response>(query)
        return data.currentUser?.id
    }

    /**
     * Creates a `user:all` scoped access token. Returns the newly created token.
     *
     * @param user The identifier of the user for which to create an access token.
     * @param note A note to attach to the access token.
     */
    public async createAccessToken(user: string, note: string): Promise<string> {
        const query = gql`
            mutation CreateAccessToken($user: ID!, $note: String!, $scopes: [String!]!) {
                createAccessToken(user: $user, note: $note, scopes: $scopes) {
                    token
                }
            }
        `

        interface Response {
            createAccessToken: {
                id: string
                token: string
            }
        }

        const data = await queryGraphQL<Response>(query, {
            user,
            note,
            scopes: ['user:all'],
        })
        return data.createAccessToken.token
    }

    /**
     * Get the content of a file. Throws an error if the repository is not known to
     * the Sourcegraph instance. Returns undefined if the input rev or the file is
     * not known to the Sourcegraph instance.
     *
     * @param repo The repository in which the file exists.
     * @param rev The revision in which the target version of the file exists.
     * @param path The path of the file.
     */
    public async getFileContent(repo: string, revision: string, path: string): Promise<string | undefined> {
        const query = gql`
            query FileContent($repo: String!, $rev: String!, $path: String!) {
                repository(name: $repo) {
                    commit(rev: $rev) {
                        file(path: $path) {
                            content
                        }
                    }
                }
            }
        `

        interface Response {
            repository: {
                commit?: {
                    file?: { content: string }
                }
            }
        }

        const data = await queryGraphQL<Response>(query, { repo, rev: revision, path })
        return data.repository.commit?.file?.content
    }

    /**
     * Perform a search.
     *
     * @param searchQuery The input to the search command.
     * @param fileLocal Set to false to not request this field, which is absent in older versions of Sourcegraph.
     */
    public async search(searchQuery: string, fileLocal = true): Promise<SearchResult[]> {
        const versionContext = sourcegraph.workspace.versionContext
        const searchContext = sourcegraph.workspace.searchContext
        const query = searchContext ? `context:${searchContext} ${searchQuery}` : searchQuery

        interface Response {
            search: {
                results: {
                    limitHit: boolean
                    results: (SearchResult | undefined)[]
                }
            }
        }

        const data = await queryGraphQL<Response>(buildSearchQuery(!!versionContext, fileLocal), {
            query,
            versionContext,
        })
        return data.search.results.results.filter(isDefined)
    }
}

function buildSearchQuery(context: boolean, fileLocal: boolean): string {
    const searchResultsFragment = gql`
        fragment SearchResults on Search {
            results {
                __typename
                results {
                    ... on FileMatch {
                        __typename
                        file {
                            path
                            commit {
                                oid
                            }
                        }
                        repository {
                            name
                        }
                        symbols {
                            name
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
                            lineNumber
                            offsetAndLengths
                        }
                    }
                }
            }
        }
    `

    const fileLocalFragment = gql`
        fragment FileLocal on Search {
            results {
                __typename
                results {
                    ... on FileMatch {
                        symbols {
                            fileLocal
                        }
                    }
                }
            }
        }
    `

    if (fileLocal) {
        if (context) {
            return gql`
                query CodeIntelSearch($query: String!, $versionContext: String) {
                    search(query: $query, versionContext: $versionContext) {
                        ...SearchResults
                        ...FileLocal
                    }
                }
                ${searchResultsFragment}
                ${fileLocalFragment}
            `
        }

        return gql`
            query CodeIntelSearch($query: String!) {
                search(query: $query) {
                    ...SearchResults
                    ...FileLocal
                }
            }
            ${searchResultsFragment}
            ${fileLocalFragment}
        `
    }

    if (context) {
        return gql`
            query CodeIntelSearch($query: String!, $versionContext: String) {
                search(query: $query, versionContext: $versionContext) {
                    ...SearchResults
                }
            }
            ${searchResultsFragment}
        `
    }

    return gql`
        query CodeIntelSearch($query: String!) {
            search(query: $query) {
                ...SearchResults
            }
        }
        ${searchResultsFragment}
    `
}
