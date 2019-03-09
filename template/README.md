# LANG code intelligence for Sourcegraph

A [Sourcegraph extension](https://docs.sourcegraph.com/extensions) that provides code intelligence (go-to-definition and find-references) for LANG, using text-based heuristics.

[**🗃️ Source code**](https://github.com/sourcegraph/sourcegraph-LANGNAME)

[**➕ Add to Sourcegraph**](https://sourcegraph.com/extensions/sourcegraph/LANGNAME) (see [usage instructions](#usage) for self-hosted Sourcegraph instances)

## Features

Works on [Sourcegraph.com](https://sourcegraph.com), [self-hosted Sourcegraph instances](https://docs.sourcegraph.com/#quickstart), and on code hosts (via the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension)).

Here's what it looks like on Sourcegraph (this screenshot shows Python as an example):

![Python screenshot](https://user-images.githubusercontent.com/1976/50882679-68768580-139a-11e9-8e58-a756c5bf4fb0.png)

## Usage

1. Enable the `sourcegraph/LANGNAME` extension:
    - On Sourcegraph.com, visit [sourcegraph.com/extensions/sourcegraph/LANGNAME](https://sourcegraph.com/extensions/sourcegraph/LANGNAME) to enable it.
    - On a self-hosted Sourcegraph instance, select **User menu > Extensions**, search for `sourcegraph/LANGNAME`, and enable it.
1. Visit any code file on Sourcegraph.
1. Hover over a token in the code file.
    - Click **Find references** to see all references to the token.
    - Click **Go to definition** (if available) to go to the token's definition.

### Optional features

The command palette (<kbd>≡</kbd>) lets you toggle other options:

-   **Basic code intel: Enable fuzzy hovers** — to see hovers and docstrings (recommended, will become default soon)
-   **Basic code intel: Enable cross-repository definitions** — to find definitions across repositories, which increases the risk of incorrect definition results
-   **Basic code intel: Disable fuzzy def/ref matching** — to disable "Go to definition" and "Find references" results from the extension (easier than enabling/disabling the extension itself if you frequently need to toggle it, such as if you sometimes want to see only precise results from language-specific extensions)

### On your code host

This extension adds the same features to code files and diffs on your code host if you're using the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension). To use it on your code host:

1. Follow the [usage steps](#usage) above to enable this `sourcegraph/LANGNAME` extension.
1. Install the [Sourcegraph browser extension](https://docs.sourcegraph.com/integration/browser_extension).
    - If you're using it with a self-hosted Sourcegraph instance, enter the Sourcegraph instance URL into the Sourcegraph browser extension options menu. Then click the gear icon and enable _Experimental features: Use extensions_.
1. Visit any file on your code host and hover over a token to see **Find references** and (if available) **Go to definition** actions.

![screenshot of using LANGNAME on GitHub](https://user-images.githubusercontent.com/1976/50882271-0c5f3180-1399-11e9-9697-e4e4fa4e29e9.png)

### Limitations

Because this extension uses text-based heuristics, its definition and reference results are not precise:

-   "Find references" on a token finds all instances of token (with the same case) in the current repository and other repositories.
-   "Go to definition" on a token goes to the definition found by [universal-ctags](https://github.com/universal-ctags/ctags), a cross-language parsing suite.

These heuristics work well for tokens with unique names, such as `render_to_view` or `TLSConfig`. They do not work well for ambiguous tokens, such as `open` or `file`.
