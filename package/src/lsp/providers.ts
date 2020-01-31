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
}
