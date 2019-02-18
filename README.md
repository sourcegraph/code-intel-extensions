# Basic code intelligence for Sourcegraph

[![Build Status](https://travis-ci.org/sourcegraph/sourcegraph-basic-code-intel.svg?branch=master)](https://travis-ci.org/sourcegraph/sourcegraph-basic-code-intel)
[![codecov](https://codecov.io/gh/sourcegraph/sourcegraph-basic-code-intel/branch/master/graph/badge.svg)](https://codecov.io/gh/sourcegraph/sourcegraph-basic-code-intel)

Many (but not all) of the [programming language Sourcegraph extensions](https://sourcegraph.com/extensions?query=category%3A%22Programming+languages%22) are thin wrappers around the basic-code-intel npm package that lives in this repository. They provide fuzzy code intelligence using a combination of ctags and search.

## Anatomy of this repository

-   The basic-code-intel npm [package/](./package/)
-   A template language extension that uses that package [template/](./template/)
-   A script that generates all of the various basic language extensions (all but Go, TypeScript, and Python at the time of writing) [generator/](./generator/)

## Updating the basic-code-intel package

After you make a change to the basic-code-intel package and bump the version number in [`package/package.json`](./package/package.json), build and publish it to npm:

```
cd package
yarn run build
npm publish
```

Then, update the version in the downstream language extensions by bumping the version in `package.json`.

Sourcegraphers only: see [generator/README.md](./generator/README.md) to update `sourcegraph/sourcegraph-$LANG` repositories.

## Creating your own language extension based on @sourcegraph/basic-code-intel

1. Create a new extension https://docs.sourcegraph.com/extensions/authoring/creating
1. Take a look at the [Java](https://github.com/sourcegraph/sourcegraph-java/blob/master/src/extension.ts) extension to see how to use the `@sourcegraph/basic-code-intel` package
1. Change the file extensions, test, and [publish](https://docs.sourcegraph.com/extensions/authoring/publishing)

## Adding a new sourcegraph/sourcegraph-\$LANG extension (Sourcegraphers only)

1. Create a new repository https://github.com/sourcegraph/sourcegraph-LANG
1. Push a single empty commit to it with any message
1. Add an entry to `languages` in [`generator/src/main.ts`](generator/src/main.ts)
1. Run `bash generate.sh`
