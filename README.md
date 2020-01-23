# Basic code intelligence for Sourcegraph

[![Build Status](https://travis-ci.org/sourcegraph/sourcegraph-basic-code-intel.svg?branch=master)](https://travis-ci.org/sourcegraph/sourcegraph-basic-code-intel)
[![codecov](https://codecov.io/gh/sourcegraph/sourcegraph-basic-code-intel/branch/master/graph/badge.svg)](https://codecov.io/gh/sourcegraph/sourcegraph-basic-code-intel)

basic-code-intel provides fuzzy code intelligence using a combination of ctags and search. All of the [programming language Sourcegraph extensions](https://sourcegraph.com/extensions?query=category%3A%22Programming+languages%22) use the basic-code-intel npm package that lives in this repository.

## Development

First install [goreman](https://github.com/mattn/goreman):

```
$ go get github.com/mattn/goreman
```

Then run:

```
$ ./dev
```

Open up your Sourcegraph settings https://sourcegraph.com/users/you/settings and disable the language extensions you're developing:

```json
  "extensions": {
      "sourcegraph/cpp": false,
      ...
  }
```

Then [sideload the extension](https://docs.sourcegraph.com/extensions/authoring/local_development) (http://localhost:1234) on your Sourcegraph instance and refresh the page. Make sure you don't see two of the same language extension.

Open the browser Network tab and you should start seeing `graphql?Search` calls when you hover over tokens.

## Anatomy of this repository

- [package/](./package/) The basic-code-intel npm package https://www.yarnpkg.com/en/package/@sourcegraph/basic-code-intel (exposes basic-code-intel functionality to [Go](https://github.com/sourcegraph/sourcegraph-go) and [TypeScript](https://github.com/sourcegraph/sourcegraph-typescript), which live in other repositories)
- [template/](./template/) A template language extension that uses that package (for development purposes)
- [generator/](./generator/) A script that generates all of the various basic language extensions (all but [Go](https://github.com/sourcegraph/sourcegraph-go) and [TypeScript](https://github.com/sourcegraph/sourcegraph-typescript), which live in separate repositories)

## Updating the basic-code-intel package

After you make a change to the basic-code-intel package and bump the version number in [`package/package.json`](./package/package.json), build and publish it to npm:

```
cd package
yarn run build
npm publish
```

Then, update the version in the downstream language extensions by bumping the version in `package.json`.

Finally, publish the extensions with `bash generator/generate.sh --publish`.

## Creating your own language extension based on @sourcegraph/basic-code-intel

1. Create a new extension https://docs.sourcegraph.com/extensions/authoring/creating
1. Take a look at the [Go](https://github.com/sourcegraph/sourcegraph-go/blob/master/src/lang-go.ts) extension to see how to use the `@sourcegraph/basic-code-intel` package
1. Change the file extensions, test, and [publish](https://docs.sourcegraph.com/extensions/authoring/publishing)

## Adding a new sourcegraph/sourcegraph-LANG extension

1. Add an entry to `languages` in [`generator/src/main.ts`](generator/src/main.ts)
1. (optional, to enable jump to definition) Ensure the language is present in the command line arguments to universal-ctags https://github.com/sourcegraph/sourcegraph/blob/21efc6844838e773b9a8f4a7ba1d5628e8076984/cmd/symbols/internal/pkg/ctags/parser.go#L71
1. Run `bash generate.sh --languages <language name> --publish`
