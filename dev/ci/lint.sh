#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")

./yarn-run.sh prettier-check # tslint eslint
