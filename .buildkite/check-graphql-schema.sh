#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")"

./yarn-run.sh "update-graphql-schema"

if [ -n "$(git status --porcelain)" ]; then
    echo "graphql schema is out of date. Run update-graphql-schema and commit the result."
    exit 1
fi
