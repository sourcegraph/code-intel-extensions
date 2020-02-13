import { CommentStyle } from './spec'

export const cStyleLineNoiseRegex = /(^\s*\*\s?)?/

export const cStyleBlock: any = {
    startRegex: /\/\*\*?/,
    lineNoiseRegex: cStyleLineNoiseRegex,
    endRegex: /\*\//,
}

export const cStyle: CommentStyle = {
    lineRegex: /\/\/\/?\s?/,
    block: cStyleBlock,
}

export const shellStyle: CommentStyle = {
    lineRegex: /#\s?/,
}

export const pythonStyle: CommentStyle = {
    docPlacement: 'below the definition',
    lineRegex: /#\s?/,
    block: {
        startRegex: /"""/,
        endRegex: /"""/,
    },
}

export const lispStyle: CommentStyle = {
    docPlacement: 'below the definition',
    block: {
        startRegex: /"/,
        endRegex: /"/,
    },
}
