#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")

CHECKS=(
    ./yarn-deduplicate.sh
)

for c in $CHECKS; do
    $c
done
