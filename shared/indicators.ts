import { Base64 } from 'js-base64'
import * as sourcegraph from 'sourcegraph'

export const linkURL = 'https://docs.sourcegraph.com/code_intelligence/explanations/precise_code_intelligence'

function makeSummary(message: string, ctaMessage: string): sourcegraph.MarkupContent {
    return { kind: sourcegraph.MarkupKind.Markdown, value: `${message} [${ctaMessage}](${linkURL})` }
}

function makeBadge(lines: string[]): sourcegraph.BadgeAttachmentRenderOptions {
    return { kind: 'info', linkURL, hoverMessage: lines.join(' ') }
}

//
// LSIF

export const lsif: sourcegraph.Badged<sourcegraph.HoverAlert> = {
    type: 'LSIFAvailableNoCaveat',
    iconKind: 'info',
    // previously: makeSummary('Semantic result.', 'Learn more.'),
    summary: makeSummary('Semantic result.', 'Learn more about precise code intelligence'),
    badge: makeBadge([
        "This data comes from a pre-computed semantic index of this project's source.",
        'Click to learn how to add this capability to all of your projects!',
    ]),
} as any

export const lsifPartialHoverOnly: sourcegraph.Badged<sourcegraph.HoverAlert> = {
    type: 'LSIFAvailableNoCaveat',
    iconKind: 'info',
    // previously: makeSummary('Partial semantic result: Go to definition may be imprecise.', 'Learn more.')
    summary: makeSummary('Partial semantic result.', 'Learn more about precise code intelligence'),
    badge: makeBadge([
        'It looks like this symbol is defined in another repository that does not have a pre-computed semantic index.',
        'Click to learn how to make these results precise by enabling semantic indexing for that project.',
    ]),
} as any

export const lsifPartialDefinitionOnly: sourcegraph.Badged<sourcegraph.HoverAlert> = {
    type: 'LSIFAvailableNoCaveat',
    iconKind: 'info',
    // previously: makeSummary('Partial semantic result: this hover text may be imprecise.', 'Learn more.')
    summary: makeSummary('Partial semantic result.', 'Learn more about precise code intelligence'),
    badge: makeBadge([
        'It looks like this symbol is defined in another repository that does not have a pre-computed semantic index.',
        'Click to learn how to make these results precise by enabling semantic indexing for that project.',
    ]),
} as any

//
// LSP

export const lsp: sourcegraph.Badged<sourcegraph.HoverAlert> = {
    iconKind: 'info',
    summary: makeSummary('Language server result.', 'Learn more about precise code intelligence'),
    badge: makeBadge([
        'This data comes from a language server running in the cloud.',
        'Click to learn how to improve the reliability of this result by enabling semantic indexing.',
    ]),
} as any

//
// Search

export const searchLSIFSupportRobust: sourcegraph.Badged<sourcegraph.HoverAlert> = {
    iconKind: 'info',
    // previously: makeSummary('Search-based result.', 'Get semantics.')
    summary: makeSummary('Search-based result.', 'Learn more about precise code intelligence'),
    badge: makeBadge([
        'This data is generated by a heuristic text-based search.',
        'Click to learn how to make these results precise by enabling semantic indexing for this project.',
    ]),
} as any

export const searchLSIFSupportExperimental: sourcegraph.Badged<sourcegraph.HoverAlert> = {
    type: 'SearchResultExperimentalLSIFSupport',
    iconKind: 'info',
    // previously: makeSummary('Search-based result.', 'Learn more.')
    summary: makeSummary('Search-based result.', 'Learn more about precise code intelligence'),
    badge: makeBadge([
        'This data is generated by a heuristic text-based search.',
        "Existing semantic indexers for this language aren't totally robust yet, but you can click here to learn how to give them a try.",
    ]),
} as any

export const searchLSIFSupportNone: sourcegraph.Badged<sourcegraph.HoverAlert> = {
    type: 'SearchResultNoLSIFSupport',
    iconKind: 'info',
    // previously: makeSummary('Search-based result.', 'Learn more.')
    summary: makeSummary('Search-based result.', 'Learn more about precise code intelligence'),
} as any

//
//
//

// TODO - import
export interface Badge {
    text: string
    linkURL?: string
    hoverMessage?: string
}

export const semanticBadge: Badge = {
    text: 'semantic',
    linkURL,
    hoverMessage: "This data comes from a pre-computed semantic index of this project's source.",
}

export const searchBasedBadge: Badge = {
    text: 'search-based',
    linkURL,
    hoverMessage: 'This data is generated by a heuristic text-based search.',
}

export const partialHoverNoDefinitionBadge: Badge = {
    text: 'partial semantic',
    linkURL,
    hoverMessage:
        'It looks like this symbol is defined in another repository that does not have a pre-computed semantic index. Go to definition may be imprecise.',
}

export const partialDefinitionNoHoverBadge: Badge = {
    text: 'partial semantic',
    linkURL,
    hoverMessage:
        'It looks like this symbol is defined in another repository that does not have a pre-computed semantic index. This hover text may be imprecise.',
}

//
//
//

/**
 * Creates a base64-encoded image URI.
 *
 * @param svg The raw SVG data.
 */
function makeIcon(svg: string): string {
    return `data:image/svg+xml;base64,${Base64.encode(
        svg
            .split('\n')
            .map(line => line.trimStart())
            .join(' ')
    )}`
}

/**
 * Creates an icon with the material design 'information-outline' style.
 *
 * @param color The color of the lines.
 */
function makeInfoIcon(color: string): string {
    return makeIcon(`
        <svg xmlns='http://www.w3.org/2000/svg' style="width:24px;height:24px" viewBox="0 0 24 24" fill="${color}">
            <path d="
                M11,
                9H13V7H11M12,
                20C7.59,
                20 4,
                16.41 4,
                12C4,
                7.59 7.59,
                4 12,
                4C16.41,
                4 20,
                7.59 20,
                12C20,
                16.41 16.41,
                20 12,
                20M12,
                2A10,
                10 0 0,
                0 2,
                12A10,
                10 0 0,
                0 12,
                22A10,
                10 0 0,
                0 22,
                12A10,
                10 0 0,
                0 12,
                2M11,
                17H13V11H11V17Z"
            />
        </svg>
    `)
}

/**
 * The badge to send back on all results that come from searched-based data.
 */
export const impreciseBadge: sourcegraph.BadgeAttachmentRenderOptions = {
    kind: 'info',
    icon: makeInfoIcon('#ffffff'),
    light: { icon: makeInfoIcon('#000000') },
    hoverMessage:
        'Search-based results - click to see how these results are calculated and how to get precise intelligence with LSIF.',
    linkURL: 'https://docs.sourcegraph.com/code_intelligence/explanations/basic_code_intelligence',
}
