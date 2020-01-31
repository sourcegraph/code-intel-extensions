#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")/../..

# mutex is necessary since CI runs various yarn installs in parallel
yarn --mutex network --frozen-lockfile --network-timeout 60000

pushd extensions/go
yarn run build
popd

pushd extensions/template
yarn run build
popd

pushd extensions/typescript
yarn run build
popd
