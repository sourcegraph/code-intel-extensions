import * as sourcegraph from 'sourcegraph'

export interface LSPProviders {
    definition: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => AsyncGenerator<sourcegraph.Definition>

    references: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        context: sourcegraph.ReferenceContext
    ) => AsyncGenerator<sourcegraph.Location[] | null>

    hover: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => AsyncGenerator<sourcegraph.Hover | null>

    externalReferences?: ExternalReferenceProvider
    implementations?: ImplementationsProvider
}

export interface ExternalReferenceProvider {
    settingName: string

    references: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position,
        context: sourcegraph.ReferenceContext
    ) => AsyncGenerator<sourcegraph.Location[] | null>
}

export interface ImplementationsProvider {
    implId: string
    panelTitle: string

    locations: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => AsyncGenerator<sourcegraph.Location[] | null>
}
