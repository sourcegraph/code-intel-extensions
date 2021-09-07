#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Build first for project references
yarn --mutex network --frozen-lockfile --network-timeout 60000
yarn run build

# Validate existing schema
yarn validate-graphql

# Validate schema is not out of date
yarn update-graphql-schema

if [ -n "$(git status --porcelain)" ]; then
    # shellcheck disable=SC2016
    echo 'graphql schema is out of date. Please run `yarn update-graphql-schema` and commit the result.'
    exit 1
fi

# Validate dependencies
yarn yarn-deduplicate --fail --list --strategy fewer ./yarn.lock || {
    # shellcheck disable=SC2016
    echo 'yarn.lock contains duplicate dependencies. Please run `yarn deduplicate` and commit the result.'
    exit 1
}
