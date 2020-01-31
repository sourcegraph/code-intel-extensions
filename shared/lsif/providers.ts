import * as sourcegraph from 'sourcegraph'

export interface LSIFProviders {
    hover: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => Promise<sourcegraph.Hover | null | undefined>

    definition: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => Promise<sourcegraph.Definition | undefined>

    references: (
        doc: sourcegraph.TextDocument,
        pos: sourcegraph.Position
    ) => Promise<sourcegraph.Location[] | null | undefined>
}
