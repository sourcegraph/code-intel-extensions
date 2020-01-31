#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")/../..

yarn --mutex network --frozen-lockfile --network-timeout 60000
yarn run prettier-check
# yarn run tslint # TODO - re-enable once we do a lint pass
# yarn run eslint # TODO - re-enable once we do a lint pass
