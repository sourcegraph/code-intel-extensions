import * as sourcegraph from 'sourcegraph'

export const lsif: sourcegraph.Badged<sourcegraph.HoverAlert>[] = [
    {
        summary: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: 'Semantic result. [Learn more.](https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence)',
        },
        badge: {
            kind: 'info',
            hoverMessage:
                "This hover data comes from a pre-computed semantic index of this project's source. Click to learn how to add this capability to all of your projects!",
            linkURL: 'https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence',
        },
        type: 'LSIFAvailableNoCaveat',
    },
]

export const lsp: sourcegraph.Badged<sourcegraph.HoverAlert>[] = [
    {
        summary: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: 'Language server result. [Get LSIF.](https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence)',
        },
        badge: {
            kind: 'info',
            hoverMessage:
                'This hover data comes from a language server running in the cloud. Click to learn how to improve the reliability of this result by enabling semantic indexing.',
            linkURL: 'https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence',
        },
    },
]

export const searchLSIFSupportRobust: sourcegraph.Badged<sourcegraph.HoverAlert>[] = [
    {
        summary: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: 'Search-based result. [Get semantics.](https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence)',
        },
        badge: {
            kind: 'info',
            hoverMessage:
                'This hover data is generated by a heuristic text-based search. Click to learn how to make these results precise by enabling semantic indexing for this project.',
            linkURL: 'https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence',
        },
    },
]

export const searchLSIFSupportExperimental: sourcegraph.Badged<sourcegraph.HoverAlert>[] = [
    {
        summary: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: 'Search-based result. [Learn more.](https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence)',
        },
        badge: {
            kind: 'info',
            hoverMessage:
                "This hover data is generated by a heuristic text-based search. Existing semantic indexers for this language aren't totally robust yet, but you can click here to learn how to give them a try.",
            linkURL: 'https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence',
        },
        type: 'SearchResultExperimentalLSIFSupport',
    },
]

export const searchLSIFSupportNone: sourcegraph.Badged<sourcegraph.HoverAlert>[] = [
    {
        summary: {
            kind: sourcegraph.MarkupKind.Markdown,
            value: 'Search-based result. [Learn more.](https://docs.sourcegraph.com/user/code_intelligence/precise_code_intelligence)',
        },
        type: 'SearchResultNoLSIFSupport',
    },
]
