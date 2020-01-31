function makeIcon(svg: string): string {
    return `data:image/svg+xml;base64,${btoa(
        svg.replace(/^\s+/g, '').replace('\n', '')
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
export const impreciseBadge = {
    icon: makeInfoIcon('#ffffff'),
    light: { icon: makeInfoIcon('#000000') },
    hoverMessage:
        'Search-based results - click to see how these results are calculated and how to get precise intelligence with LSIF.',
    linkURL:
        'https://docs.sourcegraph.com/user/code_intelligence/basic_code_intelligence',
}
