import * as sourcegraph from 'sourcegraph'
import { parseGitURI } from '../util/uri'

export interface LocationConnectionNode {
    resource: {
        path: string
        repository?: { name: string }
        commit?: { oid: string }
    }
    range: sourcegraph.Range
}

/**
 * Convert a GraphQL location connection node into a Sourcegraph location.
 *
 * @param doc The current document.
 * @param node A location connection node.
 */
export function nodeToLocation(
    doc: sourcegraph.TextDocument,
    { resource: { repository, commit, path }, range }: LocationConnectionNode
): sourcegraph.Location {
    const { repo: currentRepo, commit: currentCommit } = parseGitURI(new URL(doc.uri))

    return {
        uri: new URL(`git://${repository?.name || currentRepo}?${commit?.oid || currentCommit}#${path}`),
        range,
    }
}
