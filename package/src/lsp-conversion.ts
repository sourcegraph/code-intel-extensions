// Copied from @sourcegraph/lsp-client because adding it as a dependency makes
// providers in index.ts lose type safety.

import * as sourcegraph from 'sourcegraph'
import * as LSP from 'vscode-languageserver-types'

export const convertPosition = (sourcegraph: typeof import('sourcegraph'), position: LSP.Position): sourcegraph.Position =>
    new sourcegraph.Position(position.line, position.character)

export const convertRange = (sourcegraph: typeof import('sourcegraph'), range: LSP.Range): sourcegraph.Range =>
    new sourcegraph.Range(convertPosition(sourcegraph, range.start), convertPosition(sourcegraph, range.end))

export function convertHover(sourcegraph: typeof import('sourcegraph'), hover: LSP.Hover | null): sourcegraph.Hover | null {
    if (!hover) {
        return null
    }
    const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents]
    return {
        range: hover.range && convertRange(sourcegraph, hover.range),
        contents: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: contents
                .map(content => {
                    if (LSP.MarkupContent.is(content)) {
                        // Assume it's markdown. To be correct, markdown would need to be escaped for non-markdown kinds.
                        return content.value
                    }
                    if (typeof content === 'string') {
                        return content
                    }
                    if (!content.value) {
                        return ''
                    }
                    return '```' + content.language + '\n' + content.value + '\n```'
                })
                .filter(str => !!str.trim())
                .join('\n\n---\n\n'),
        },
    }
}

export const convertLocation = (
    sourcegraph: typeof import('sourcegraph'),
    location: LSP.Location
): sourcegraph.Location => ({
    uri: new sourcegraph.URI(location.uri),
    range: convertRange(sourcegraph, location.range),
})

export function convertLocations(
    sourcegraph: typeof import('sourcegraph'),
    locationOrLocations: LSP.Location | LSP.Location[] | null
): sourcegraph.Location[] | null {
    if (!locationOrLocations) {
        return null
    }
    const locations = Array.isArray(locationOrLocations) ? locationOrLocations : [locationOrLocations]
    return locations.map(location => convertLocation(sourcegraph, location))
}
