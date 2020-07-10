#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")"

./yarn-run.sh "yarn-deduplicate --fail --list --strategy fewer ./yarn.lock" || {
    echo 'yarn.lock contains duplicate dependencies. Please run `yarn deduplicate` and commit the result.'
    exit 1
}
