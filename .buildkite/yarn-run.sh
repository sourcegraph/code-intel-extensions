#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# mutex is necessary since CI runs various yarn installs in parallel
yarn --mutex network --frozen-lockfile --network-timeout 60000

# Need to build for project references
yarn build

for cmd in "$@"; do
    yarn -s --cwd "${CWD:-.}" run ${cmd}
done
