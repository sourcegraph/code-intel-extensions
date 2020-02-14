import { BlockCommentStyle, CommentStyle } from './spec'

/** Matches two or more slashes followed by one optional space. */
export const slashPattern = /\/\/\/*\s?/

/** Matches three slashes followed by one optional space. */
export const tripleSlashPattern = /\/\/\/\s?/

/** Matches a hash followed by one optional space. */
export const hashPattern = /#\s?/

/** Matches two or more dashes followed by one optional space. */
export const dashPattern = /---*\s?/

// TODO - does not need to be optional?
/** Matches whitespace followed by a asterisk at the beginning of a line. */
export const leadingAsteriskPattern = /(^\s*\*\s?)?/

/** Matches whitespace followed by an at-symbol at beginning of a line. */
export const leadingAtSymbolPattern = /^\s*@/

export const cStyleBlockComment: BlockCommentStyle = {
    startRegex: /\/\*\*?/,
    endRegex: /\*\//,
    lineNoiseRegex: leadingAsteriskPattern,
}

export const cStyleComment: CommentStyle = {
    lineRegex: slashPattern,
    block: cStyleBlockComment,
}

export const shellStyleComment: CommentStyle = {
    lineRegex: hashPattern,
}

export const pythonStyleComment: CommentStyle = {
    lineRegex: hashPattern,
    block: { startRegex: /"""/, endRegex: /"""/ },
    docPlacement: 'below the definition',
}

export const lispStyleComment: CommentStyle = {
    block: { startRegex: /"/, endRegex: /"/ },
    docPlacement: 'below the definition',
}
