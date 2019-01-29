# Basic code intelligence for Sourcegraph

Many of the [programming language Sourcegraph extensions](https://sourcegraph.com/extensions?query=category%3A%22Programming+languages%22) are thin wrappers around the basic-code-intel npm package that lives in this repository and provide fuzzy code intelligence using a combination of ctags and search.

## Anatomy of this repository

- The basic-code-intel npm [package/](./package/)
- A template language extension that uses that package [template/](./template/)
- A script that generates all of the various basic language extensions (all but Go, TypeScript, and Python at the time of writing) [generator/](./generator/)

## Publishing the basic-code-intel package and updating language extensions

After you make a change to the basic-code-intel package, push it out to all of the language extensions by running:

```
bash generator/generate.sh
```

That generator will:

- Instantiate the template in a temporary directory by filling in the variables (e.g. `$LANG` -> `Java`)
- Update the first commit in each language extension's repository, preserving subsequent commits (requires push access to https://github.com/sourcegraph/sourcegraph-java et al.)
- Publish the extension to the registry (expects `$HOME/src-config.prod.json` to exist with a token for the `sourcegraph` user
