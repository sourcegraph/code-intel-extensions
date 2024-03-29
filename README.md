# Sourcegraph code intelligence extensions

[![Build status](https://badge.buildkite.com/6766067d76ccea068c30c6e143919363b24accd235892bfa07.svg)](https://buildkite.com/sourcegraph/code-intel-extensions)
[![codecov](https://codecov.io/gh/sourcegraph/code-intel-extensions/branch/master/graph/badge.svg)](https://codecov.io/gh/sourcegraph/code-intel-extensions)

This repository contains the code for the [Sourcegraph extensions that provide code intelligence](https://sourcegraph.com/extensions?query=category%3A%22Programming+languages%22). These extensions provide precise code intelligence via LSIF and provides fuzzy code intelligence using a combination of ctags and search.

## Repository structure

- [`template`](./template) Template used to create extensions for specific languages
- [`template/src/language-specs`](./template/src/language-specs) Language definitions, which are fed into the template to instantiate many language extensions

## Development

1. Run `yarn`
2. Run `yarn run generate --languages=cpp && yarn --cwd generated-cpp run serve` (replace `cpp` with your language)
3. Open up your Sourcegraph settings https://sourcegraph.com/users/you/settings and disable the language extensions you're developing:

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

1. Add an entry to the [`template/src/language-specs`](template/src/language-specs) directory. For languages with a trivial configuration add a new entry (in alphabetical order) to [`languages.ts`](template/src/language-specs/languages.ts). Otherwise, add additional files following the existing examples.
2. (optional, to enable jump to definition) Ensure the language is present in the command line arguments to universal-ctags https://github.com/sourcegraph/go-ctags/blob/main/ctags.go#L69
3. Make sure there is a mapping entry for the `languageID` in https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/client/template/src/languages.ts#L40
4. Generate and publish the extension as described below.

## Generating & publishing extensions

Typically you do not need to explicitly generate and publish extensions. By default, extensions are generated and published in BuildKite from the [master branch](https://buildkite.com/sourcegraph/code-intel-extensions/builds?branch=master).

If you need to manually generate/publish extensions, do so as follows:

Generate:

- Specific language extensions: `yarn run generate --languages=foo,bar`
- All known language extensions: `yarn run generate`

Publish:

1. Ensure the [`src` command-line tool](https://github.com/sourcegraph/src-cli)
   is installed on your PATH, and environment variables are set:
   - `SRC_ENDPOINT` should be the URL of your instance.
   - `SRC_ACCESS_TOKEN` should contain an access token for your instance.
2. Publish:
   - Specific generated language extensions: `yarn run publish --languages=foo,bar`
   - All known generated language extensions: `yarn run publish`
