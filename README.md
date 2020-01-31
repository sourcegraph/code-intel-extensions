# Sourcegraph code intelligence extensions

This repository contains the code for the [Sourcegraph extensions that provide code intelligence](https://sourcegraph.com/extensions?query=category%3A%22Programming+languages%22). These extensions provide precise code intelligence via LSIF and Language Servers, and provides fuzzy code intelligence using a combination of ctags and search.

## Development

First, run `yarn` in the root.

To develop the Go or TypeScript extensions, navigate into that language's extension directory and run `yarn run serve`. To develop an extension for any other language, run the same command from `extensions/template`.

Open up your Sourcegraph settings https://sourcegraph.com/users/you/settings and disable the language extensions you're developing:

```json
  "extensions": {
      "sourcegraph/cpp": false,
      ...
  }
```

Then [sideload the extension](https://docs.sourcegraph.com/extensions/authoring/local_development) (http://localhost:1234) on your Sourcegraph instance and refresh the page. Make sure you don't see two of the same language extension.

## Generating extensions

Extensions without Language Server support (all extensions _except_ for Go and TypeScript) are defined declaratively in [languages.ts](languages.ts).

To generate an extension for a language defined in this way, run `yarn run generate` in the root of this project. To generate extensions only a specific set of langauges, run `yarn run generate --langauges lang1,lang2` instead.

To publish the generated extension, run `yarn run publish`. To publish extensions only a specific set of languages, run `yarn run publish --languages lang1,lang2` instead.

## Adding a new sourcegraph/sourcegraph-LANG extension

1. Add an entry to `languages` in [`generator/src/main.ts`](generator/src/main.ts)
1. (optional, to enable jump to definition) Ensure the language is present in the command line arguments to universal-ctags https://github.com/sourcegraph/sourcegraph/blob/21efc6844838e773b9a8f4a7ba1d5628e8076984/cmd/symbols/internal/pkg/ctags/parser.go#L71
1. Generate and publish the extension as described in the previous section
