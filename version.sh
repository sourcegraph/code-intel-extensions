#!/bin/bash

set -ex

if [ -z "$1" ]; then
  echo "Must specify a version (e.g. 4.0.2)."
  exit 1
fi

version="$1"

gsed -i 's/"version": ".*"/"version": "'$version'"/' package/package.json
gsed -i 's/"@sourcegraph\/basic-code-intel": ".*"/"@sourcegraph\/basic-code-intel": "'$version'"/' template/package.json
