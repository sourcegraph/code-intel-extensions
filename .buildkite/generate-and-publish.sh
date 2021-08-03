#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Build first for project references
yarn --mutex network --frozen-lockfile --network-timeout 60000
yarn run build

tmpfile=$(mktemp /tmp/yarn-run-config.XXXXXX)
trap '{ rm -f "$tmpfile"; }' EXIT

cat << EOF >> "${tmpfile}"
{
    "endpoint": "https://sourcegraph.com",
    "accessToken": "${CODE_INTEL_EXTENSIONS_SOURCEGRAPH_ACCESS_TOKEN}"
}
EOF

SRC_CONFIG="${tmpfile}" yarn run generate --languages "$1"
SRC_CONFIG="${tmpfile}" yarn run publish --languages "$1"
