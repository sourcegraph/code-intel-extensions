import * as sourcegraph from 'sourcegraph'
import * as lsp from 'vscode-languageserver-protocol'
import * as lspext from './lspext'

export const location = ({
    currentDocURI,
    location: { range, uri: uriFromLangServer },
}: {
    currentDocURI: string
    location: lsp.Location
}): sourcegraph.Location => {
    let definitionURI: sourcegraph.URI
    if (/^file:\/\/\//.test(uriFromLangServer)) {
        // The definition is in a file in the same repo
        const docURL = new URL(currentDocURI)
        docURL.hash = uriFromLangServer.slice('file:///'.length)
        definitionURI = new sourcegraph.URI(docURL.href)
    } else {
        definitionURI = new sourcegraph.URI(uriFromLangServer)
    }

    return new sourcegraph.Location(
        definitionURI,
        range &&
            new sourcegraph.Range(
                new sourcegraph.Position(
                    range.start.line,
                    range.start.character
                ),
                new sourcegraph.Position(range.end.line, range.end.character)
            )
    )
}

export const definition = ({
    currentDocURI,
    definition,
}: {
    currentDocURI: string
    definition: lsp.Definition
}): sourcegraph.Definition => {
    if (!definition) {
        return null
    }

    if (Array.isArray(definition)) {
        return definition.map(loc => location({ currentDocURI, location: loc }))
    } else {
        const loc = definition
        return location({
            currentDocURI,
            location: loc,
        })
    }
}

export const xdefinition = ({
    currentDocURI,
    xdefinition,
}: {
    currentDocURI: string
    xdefinition: lspext.Xdefinition[] | null
}): sourcegraph.Definition => {
    if (!xdefinition) {
        return null
    }

    return definition({
        currentDocURI,
        definition: xdefinition.map(loc => loc.location),
    })
}

export const references = ({
    currentDocURI,
    references,
}: {
    currentDocURI: string
    references: lsp.Location[] | null
}): sourcegraph.Location[] => {
    if (!references) {
        return []
    }

    return references.map(loc => location({ currentDocURI, location: loc }))
}

export const xreferences = ({
    references,
}: {
    references: (lspext.Xreference & { currentDocURI: string })[] | null
}): sourcegraph.Location[] => {
    if (!references) {
        return []
    }

    return references.map(reference =>
        location({
            currentDocURI: reference.currentDocURI,
            location: reference.reference,
        })
    )
}
