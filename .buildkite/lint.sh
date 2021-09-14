#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")/.."

yarn --mutex network --frozen-lockfile --network-timeout 60000
yarn run build
yarn run eslint
yarn run prettier-check
