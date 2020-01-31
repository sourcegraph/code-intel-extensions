import * as sourcegraph from 'sourcegraph'
import { TextDocumentPositionParams, WorkspaceFolder } from 'vscode-languageserver-protocol'
import {
    Diagnostic,
    DiagnosticSeverity,
    Hover,
    Location,
    MarkupContent,
    Position,
    Range,
} from 'vscode-languageserver-types'

export const convertProviderParams = (
    { textDocument, position }: { textDocument: sourcegraph.TextDocument; position: sourcegraph.Position },
    { clientToServerURI }: { clientToServerURI: (u: URL) => URL }
): TextDocumentPositionParams => ({
    textDocument: {
        uri: clientToServerURI(new URL(textDocument.uri)).href,
    },
    position: {
        line: position.line,
        character: position.character,
    },
})

export const convertPosition = (sourcegraph: typeof import('sourcegraph'), position: Position): sourcegraph.Position =>
    new sourcegraph.Position(position.line, position.character)

export const convertRange = (sourcegraph: typeof import('sourcegraph'), range: Range): sourcegraph.Range =>
    new sourcegraph.Range(convertPosition(sourcegraph, range.start), convertPosition(sourcegraph, range.end))

export function convertHover(sourcegraph: typeof import('sourcegraph'), hover: Hover | null): sourcegraph.Hover | null {
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
                    if (MarkupContent.is(content)) {
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
    location: Location
): sourcegraph.Location => ({
    uri: new sourcegraph.URI(location.uri),
    range: convertRange(sourcegraph, location.range),
})

export function convertLocations(
    sourcegraph: typeof import('sourcegraph'),
    locationOrLocations: Location | Location[] | null
): sourcegraph.Location[] | null {
    if (!locationOrLocations) {
        return null
    }
    const locations = Array.isArray(locationOrLocations) ? locationOrLocations : [locationOrLocations]
    return locations.map(location => convertLocation(sourcegraph, location))
}

const DIAGNOSTIC_COLORS: Readonly<Record<DiagnosticSeverity, string>> = {
    [DiagnosticSeverity.Error]: 'var(--danger, #dc3545)',
    [DiagnosticSeverity.Information]: 'var(--info, #17a2b8)',
    [DiagnosticSeverity.Warning]: 'var(--success, #ffc107)',
    [DiagnosticSeverity.Hint]: 'var(--secondary, #6c757d)',
}
export const convertDiagnosticToDecoration = (
    sourcegraph: typeof import('sourcegraph'),
    diagnostic: Diagnostic
): sourcegraph.TextDocumentDecoration => ({
    after: {
        color: DIAGNOSTIC_COLORS[diagnostic.severity ?? DiagnosticSeverity.Hint],
        contentText: diagnostic.message,
    },
    range: convertRange(sourcegraph, diagnostic.range),
})

export const toLSPWorkspaceFolder = ({ clientToServerURI }: { clientToServerURI: (u: URL) => URL }) => (
    root: sourcegraph.WorkspaceRoot
): WorkspaceFolder => {
    const serverUri = clientToServerURI(new URL(root.uri.toString()))
    return {
        uri: serverUri.href,
        name: new URL(serverUri.href).pathname.split('/').pop()!,
    }
}

/**
 * Rewrites all `uri` properties in an object, recursively
 */
export function rewriteUris(obj: any, transform: (uri: URL) => URL): void {
    // Scalar
    if (typeof obj !== 'object' || obj === null) {
        return
    }
    // Arrays
    if (Array.isArray(obj)) {
        for (const element of obj) {
            rewriteUris(element, transform)
        }
        return
    }
    // Object
    if ('uri' in obj) {
        obj.uri = transform(new URL(obj.uri)).href
    }
    for (const key of Object.keys(obj)) {
        rewriteUris(obj[key], transform)
    }
}
