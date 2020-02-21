import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import { asArray } from '../util/helpers'

const DIAGNOSTIC_COLORS: Readonly<Record<lsp.DiagnosticSeverity, string>> = {
    [lsp.DiagnosticSeverity.Error]: 'var(--danger, #dc3545)',
    [lsp.DiagnosticSeverity.Information]: 'var(--info, #17a2b8)',
    [lsp.DiagnosticSeverity.Warning]: 'var(--success, #ffc107)',
    [lsp.DiagnosticSeverity.Hint]: 'var(--secondary, #6c757d)',
}

/**
 * Ensures a location or location link is a location.
 *
 * @param location An LSP location or location link.
 */
export function toLocation(
    location: lsp.Location | lsp.LocationLink
): lsp.Location {
    return lsp.LocationLink.is(location)
        ? { uri: location.targetUri, range: location.targetRange }
        : location
}

/**
 * Convert an LSP location into a Sourcegraph location.
 *
 * @param location An LSP location.
 */
export function convertLocation(
    location: lsp.Location | lsp.LocationLink
): sourcegraph.Location {
    return {
        uri: new URL(toLocation(location).uri),
        range: convertRange(toLocation(location).range),
    }
}

/**
 * Convert an LSP location or location list into a list of Sourcegraph locations.
 *
 * @param locationOrLocations An LSP location or location list.
 */
export function convertLocations(
    locationOrLocations:
        | lsp.Location
        | lsp.Location[]
        | lsp.LocationLink[]
        | null
): sourcegraph.Location[] | null {
    if (!locationOrLocations) {
        return null
    }
    return asArray<lsp.Location | lsp.LocationLink>(
        locationOrLocations
    ).map(location => convertLocation(location))
}

/**
 * Convert an LSP position into a Sourcegraph position.
 *
 * @param position An LSP position.
 */
export function convertPosition(position: lsp.Position): sourcegraph.Position {
    return new sourcegraph.Position(position.line, position.character)
}

/**
 * Convert an LSP range into a Sourcegraph range.
 *
 * @param range An LSP range.
 */
export function convertRange(range: lsp.Range): sourcegraph.Range {
    return new sourcegraph.Range(
        convertPosition(range.start),
        convertPosition(range.end)
    )
}

/**
 * Convert provider params into an LSP request payload.
 *
 * @param textDocument The current text document.
 * @param position The current hover position.
 * @param clientToServerURI A function that converts a URI to one reachable from the language server.
 */
export function convertProviderParams(
    textDocument: sourcegraph.TextDocument,
    position: sourcegraph.Position,
    clientToServerURI: (u: URL) => URL
): lsp.TextDocumentPositionParams {
    const uri = clientToServerURI(new URL(textDocument.uri)).href

    return {
        textDocument: { uri },
        position: { line: position.line, character: position.character },
    }
}

/**
 * Convert an LSP hover into a Sourcegraph hover.
 *
 * @param hover An LSP hover.
 */
export function convertHover(
    hover: lsp.Hover | null
): sourcegraph.Hover | null {
    if (!hover) {
        return null
    }
    const contents = asArray(hover.contents)
    return {
        range: hover.range && convertRange(hover.range),
        contents: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: contents
                .map(content => {
                    if (lsp.MarkupContent.is(content)) {
                        // Assume it's markdown. To be correct, markdown would need to be escaped for non-markdown kinds.
                        return content.value
                    }
                    if (typeof content === 'string') {
                        return content
                    }
                    if (!content.value) {
                        return ''
                    }
                    return (
                        '```' +
                        content.language +
                        '\n' +
                        content.value +
                        '\n```'
                    )
                })
                .filter(str => !!str.trim())
                .join('\n\n---\n\n'),
        },
    }
}

/**
 * Convert an LSP diagnostic into a Sourcegraph text document decoration.
 *
 * @param diagnostic An LSP diagnostic.
 */
export function convertDiagnosticToDecoration(
    diagnostic: lsp.Diagnostic
): sourcegraph.TextDocumentDecoration {
    return {
        after: {
            color:
                DIAGNOSTIC_COLORS[
                    diagnostic.severity ?? lsp.DiagnosticSeverity.Hint
                ],
            contentText: diagnostic.message,
        },
        range: convertRange(diagnostic.range),
    }
}

/**
 * Create a function that converts a Sourcegraph workspace root into an LSP workspace folder.
 *
 * @param clientToServerURI A function that converts a URI to one reachable from the language server.
 */
export function toLSPWorkspaceFolder(
    clientToServerURI: (u: URL) => URL
): (root: sourcegraph.WorkspaceRoot) => lsp.WorkspaceFolder {
    return root => {
        const serverUri = clientToServerURI(new URL(root.uri.toString()))
        return {
            uri: serverUri.href,
            name: new URL(serverUri.href).pathname.split('/').pop()!,
        }
    }
}

/**
 * Recursively rewrites all `uri` properties in an object.
 *
 * @param obj The object to mutate.
 * @param transform The transform function to apply to URLs.
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
