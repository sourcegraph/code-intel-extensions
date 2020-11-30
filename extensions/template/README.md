# Code intelligence for LANG

This extension provides LANG code intelligence on Sourcegraph.

[**🗃️ Source code**](https://github.com/sourcegraph/code-intel-extensions/tree/master/extensions/template)

![Python code intelligence](https://user-images.githubusercontent.com/1976/50882679-68768580-139a-11e9-8e58-a756c5bf4fb0.png)

## Usage

1. Enable the `sourcegraph/LANGID` extension:
   - On Sourcegraph.com, visit the [extension page](https://sourcegraph.com/extensions/sourcegraph/LANGID) to enable it.
   - On a self-hosted Sourcegraph instance, select **User menu > Extensions**, search for `sourcegraph/LANGID`, and enable it.
1. Visit any LANG code file on Sourcegraph.
1. Hover over a token in the code file.
   - See a description of the token.
   - Click **Go to definition** (if available) to go to the token's definition.
   - Click **Find references** to see all references to the token.

### On your code host

This extension adds the same features to code files and diffs on your code host if you're using the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension). To use it on your code host:

1. Follow the [usage steps](#usage) above to enable this extension.
1. Install the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension).
   - If you're using it with a self-hosted Sourcegraph instance, enter the Sourcegraph instance URL into the Sourcegraph browser extension options menu. Then click the gear icon and enable _Experimental features: Use extensions_.
1. Visit any file on your code host and hover over a token to see a description of the token, a **Go to definition** action (if available), and a **Find references** action.

![screenshot of using LANGID on GitHub](https://user-images.githubusercontent.com/1976/50882271-0c5f3180-1399-11e9-9697-e4e4fa4e29e9.png)

## Search-based code intelligence

This extension comes with built-in code intelligence provided by [search-based heuristics](https://docs.sourcegraph.com/code_intelligence/explanations/search_based_code_intelligence). Because this extension uses text-based heuristics, its definition and reference results are not precise:

- "Go to definition" on a token goes to the definition found by [universal-ctags](https://github.com/universal-ctags/ctags), a cross-language parsing suite.
- "Find references" on a token finds all instances of token (with the same case) in the current repository and other repositories.

These heuristics work well for tokens with unique names, such as `render_to_view` or `TLSConfig`. They do not work well for ambiguous tokens, such as `open` or `file`.

### Indexed and archived repositories

To include indexed and/or archived repositories in search results, add the following to your Sourcegraph global settings:

```json
  "basicCodeIntel.includeForks": true,
  "basicCodeIntel.includeArchives": true
```

### Large repositories

Search-based code intelligence will perform a search query in the commit you are viewing. This may cause performance issues if the commit is not indexed and the repository is large. After a timeout period with no results, an index-only search will be performed. This type of query may return results for a commit other than the one you are currently viewing. The default timeout period is five seconds, but can be lowered by adding the following to your Sourcegraph global settings (units are milliseconds):

```json
  "basicCodeIntel.unindexedSearchTimeout": 1000
```

For organizations that organize code in a monorepo, it may never be useful to perform an un-indexed search. To force only indexed search queries, add the following to your Sourcgraph global settings:

```json
  "basicCodeIntel.indexOnly": true
```

## LSIF

To enable [LSIF support](https://docs.sourcegraph.com/code_intelligence/explanations/precise_code_intelligence), add these to your Sourcegraph global settings:

```json
  "codeIntel.lsif": true
```
