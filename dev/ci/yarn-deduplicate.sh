#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")

# Disabled in CI for now as we require explicit resolutions
# ./yarn-run.sh "yarn-deduplicate --fail --list --strategy fewer ./yarn.lock" || {
#     echo 'yarn.lock contains duplicate dependencies. Please run `yarn deduplicate` and commit the result.'
#     exit 1
# }
