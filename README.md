# Sourcegraph code intelligence extensions

This repository contains the code for the [Sourcegraph extensions that provide code intelligence](https://sourcegraph.com/extensions?query=category%3A%22Programming+languages%22). These extensions provide precise code intelligence via LSIF and Language Servers, and provides fuzzy code intelligence using a combination of ctags and search.

## Repository structure

-   [`src/extensions/go`](./src/extensions/go) The Go extension (supports LSP)
-   [`src/extensions/typescript`](./src/extensions/typescript) The TypeScript extension (supports LSP)
-   [`src/extensions/template`](./src/extensions/template) Template for all other languages (**does not** support LSP)
-   [`shared/language-specs`](./shared/language-specs) Language definitions, which are fed into the template to instantiate many language extensions

## Development

1. Run `yarn`
1. Run `yarn --cwd extensions/{go,typescript,template} run serve` (pick one, `template` includes all others)
1. Open up your Sourcegraph settings https://sourcegraph.com/users/you/settings and disable the language extensions you're developing:

```json
{
  ...
  "extensions": {
      "sourcegraph/cpp": false,
      ...
  }
}
```

4. [Sideload the extension](https://docs.sourcegraph.com/extensions/authoring/local_development) (hit OK on the alert to accept the default URL http://localhost:1234) on your Sourcegraph instance and refresh the page. Make sure you don't see two of the same language extension in the **Ext** menu.

## Adding a language extension

1. Add an entry to the [`shared/language-specs`](shared/language-specs) directory. For languages with a trivial configuration add a new entry (in alphabetical order) to [`languages.ts`](shared/language-specs/languages.ts). Otherwise, add additional files following the existing examples.
1. (optional, to enable jump to definition) Ensure the language is present in the command line arguments to universal-ctags https://github.com/sourcegraph/sourcegraph/blob/21efc6844838e773b9a8f4a7ba1d5628e8076984/cmd/symbols/internal/pkg/ctags/parser.go#L71
1. Make sure there is a mapping entry for the `languageID` in https://github.com/sourcegraph/sourcegraph/blob/master/shared/src/languages.ts#L40
1. Generate and publish the extension as described in the previous section.

## Publishing extensions

Extensions are generated and published from the [master branch](https://buildkite.com/sourcegraph/code-intel-extensions/builds?branch=master).
