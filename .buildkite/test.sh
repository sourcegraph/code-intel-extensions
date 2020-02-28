#!/usr/bin/env bash

set -ex
cd $(dirname "${BASH_SOURCE[0]}")

./yarn-run.sh "cover --verbose"
bash <(curl -s https://codecov.io/bash)
