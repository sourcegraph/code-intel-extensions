#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")

./yarn-run-config.sh "generate --languages $1" "publish --languages $1"
