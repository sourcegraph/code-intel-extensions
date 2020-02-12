import * as sourcegraph from 'sourcegraph'

export interface LocationConnectionNode {
    resource: {
        path: string
        repository: { name: string }
        commit: { oid: string }
    }
    range: sourcegraph.Range
}

/**
 * Convert LSIF response node into a Sourcegraph location.
 *
 * @param node A location connection node.
 */
export function nodeToLocation({
    resource: { repository, commit, path },
    range,
}: LocationConnectionNode): sourcegraph.Location {
    return {
        uri: new URL(`git://${repository.name}?${commit.oid}#${path}`),
        range,
    }
}
