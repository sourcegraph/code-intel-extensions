# `sourcegraph/sourcegraph-LANG` language extension generator (Sourcegraphers only)

This script will generate all of the language extensions owned by `sourcegraph` that are based on the [../template](../template):

```
bash generator/generate.sh --publish
```

This will:

-   Instantiate the template in a temporary directory by filling in the variables (e.g. `LANG` -> `Java`)
-   Publish the extension to the registry (expects `$HOME/src-config.prod.json` to exist with a token for the `sourcegraph` user
