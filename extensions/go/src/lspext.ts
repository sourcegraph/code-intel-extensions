import * as lsp from 'vscode-languageserver-protocol'

export interface LSPSymbol {
    id: string
    name: string
    package: string
    packageName: string
    recv: string
    vendor: boolean
}

export interface Xdefinition {
    location: lsp.Location
    symbol: LSPSymbol
}

export interface Xreference {
    reference: lsp.Location
    symbol: LSPSymbol
}
