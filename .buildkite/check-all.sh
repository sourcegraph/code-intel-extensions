#!/usr/bin/env bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")"

CHECKS=(
    ./yarn-deduplicate.sh
    ./check-graphql-schema.sh
)

for c in "${CHECKS[@]}"; do
    $c
done
