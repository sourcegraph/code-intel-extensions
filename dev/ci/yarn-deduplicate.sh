#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")/../..

yarn --mutex network --frozen-lockfile --network-timeout 60000
yarn run -s yarn-deduplicate --fail --list --strategy fewer ./yarn.lock || {
    echo 'yarn.lock contains duplicate dependencies. Please run `yarn deduplicate` and commit the result.'
    exit 1
}
