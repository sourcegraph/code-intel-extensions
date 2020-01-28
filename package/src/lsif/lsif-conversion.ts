import * as sourcegraph from 'sourcegraph'

export type LocationConnectionNode = {
    resource: {
        path: string
        repository: { name: string }
        commit: { oid: string }
    }
    range: sourcegraph.Range
}

export function nodeToLocation(node: LocationConnectionNode): sourcegraph.Location {
    return {
        uri: new sourcegraph.URI(
            `git://${node.resource.repository.name}?${node.resource.commit.oid}#${node.resource.path}`
        ),
        range: new sourcegraph.Range(
            node.range.start.line,
            node.range.start.character,
            node.range.end.line,
            node.range.end.character
        ),
    }
}
