import { activateBasicCodeIntel } from '../../package/lib'

// export const activate = activateBasicCodeIntel({
//     fileExts: ['cpp', 'c'],
//     definitionPatterns: [],
//     commentStyle: {
//         docPlacement: 'above the definition',
//         lineRegex: /^\s*\/\/\s*(.*)/,
//         // lineRegex: /^\s*#\s*(.*)/,
//         block: {
//             startRegex: /\/\*\s*/,
//             contentRegex: /^\s*\*?\s*(.*)/,
//             endRegex: /\*\//,
//         },
//     },
// })

export const activate = activateBasicCodeIntel({
    fileExts: ['py'],
    definitionPatterns: [],
    commentStyle: {
        docPlacement: 'below the definition',
        lineRegex: /^\s*#\s*(.*)/,
        block: {
            startRegex: /"""/,
            contentRegex: /^\s*(.*)/,
            endRegex: /"""/,
        },
    },
})
