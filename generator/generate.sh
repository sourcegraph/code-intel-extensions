#!/bin/bash

set -ex
cd "$(dirname "${BASH_SOURCE[0]}")"

yarn -s

( cd ../package ; yarn run build )

yarn run ts-node -P tsconfig.json src/main.ts "$@"
