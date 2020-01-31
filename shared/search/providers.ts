import * as sourcegraph from 'sourcegraph'

export interface SearchProviders {
    definition: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => Promise<sourcegraph.Definition>

    references: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => Promise<sourcegraph.Location[] | null>

    hover: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => Promise<sourcegraph.Hover | null>
}
