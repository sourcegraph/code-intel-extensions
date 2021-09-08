#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")"

tmpfile=$(mktemp /tmp/yarn-run-config.XXXXXX)
trap '{ rm -f "$tmpfile"; }' EXIT

cat << EOF >> "${tmpfile}"
{
    "endpoint": "https://sourcegraph.com",
    "accessToken": "${CODE_INTEL_EXTENSIONS_SOURCEGRAPH_ACCESS_TOKEN}"
}
EOF

SRC_CONFIG="${tmpfile}" ./yarn-run.sh "$@"
