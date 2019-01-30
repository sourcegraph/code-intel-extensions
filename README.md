# Basic code intelligence for Sourcegraph

Many (but not all) of the [programming language Sourcegraph extensions](https://sourcegraph.com/extensions?query=category%3A%22Programming+languages%22) are thin wrappers around the basic-code-intel npm package that lives in this repository. They provide fuzzy code intelligence using a combination of ctags and search.

## Anatomy of this repository

- The basic-code-intel npm [package/](./package/)
- A template language extension that uses that package [template/](./template/)
- A script that generates all of the various basic language extensions (all but Go, TypeScript, and Python at the time of writing) [generator/](./generator/)

## Publishing the basic-code-intel package

After you make a change to the basic-code-intel package and bump the version number in [`package/package.json`](./package/package.json), build and publish it to npm:

```
cd package
yarn run build
npm publish
```

Then, update the version in the downstream language extensions by bumping the version in `package.json`.

If you have collaborator access to all of the `sourcegraph/sourcegraph-$LANG` language extensions (e.g. if you're a member of http://github.com/sourcegraph), then update all of them by running:

```
bash generator/generate.sh
```

That generator will:

- Instantiate the template in a temporary directory by filling in the variables (e.g. `$LANG` -> `Java`)
- Update the first commit in each language extension's repository, preserving subsequent commits (requires push access to https://github.com/sourcegraph/sourcegraph-java et al.)
- Publish the extension to the registry (expects `$HOME/src-config.prod.json` to exist with a token for the `sourcegraph` user

## Creating your own language extension based on @sourcegraph/basic-code-intel

1. Create a new extension https://docs.sourcegraph.com/extensions/authoring/creating
1. Take a look at the [Java](https://github.com/sourcegraph/sourcegraph-java/blob/master/src/extension.ts) extension to see how to use the `@sourcegraph/basic-code-intel` package
1. Change the file extensions, test, and publish

## Adding a new sourcegraph/sourcegraph-$LANG extension

If you have collaborator access to all of the `sourcegraph/sourcegraph-$LANG` language extensions (e.g. you're a member of http://github.com/sourcegraph):

1. Create a new repository https://github.com/sourcegraph/sourcegraph-LANG
1. Push a single empty commit to it with any message
1. Add an entry to `languages` in [`generator/src/main.ts`](generator/src/main.ts)
1. Run `bash generate.sh`
