#!/usr/bin/env bash

set -e
cd $(dirname "${BASH_SOURCE[0]}")/..

# Set icons for languages that do not have a buildkite emoji
# https://github.com/buildkite/emojis
declare -A special_icons
special_icons=(
    ["cuda"]="question"
    ["dart"]="dartlang"
    ["groovy"]="question"
    ["lisp"]="question"
    ["ocaml"]="question"
    ["pascal"]="question"
    ["perl"]="question"
    ["powershell"]="question"
    ["protobuf"]="question"
    ["r"]="question"
    ["thrift"]="question"
    ["verilog"]="question"
    ["vhdl"]="question"
)

tmpfile=$(mktemp /tmp/gen-pipeline.XXXXXX)
trap "{ rm -f $tmpfile; }" EXIT

# Determine the languages we can generate from the icons present
# in the repo. We have a test to ensure each defined language has
# a png file with the same basename as the language identifier.
# Strip the suffix of each icon in the list.

icons=($(ls icons))
langs=(`echo ${icons[@]%.*}`)

for lang in ${langs[@]}; do
    # Skip lsp-backed extensions
    if [ "${lang}" = "go" ] || [ "${lang}" = "typescript" ]; then
        continue
    fi

cat << EOF >> ${tmpfile}
  - command: ./.buildkite/gen-and-publish.sh "${lang}"
    label: ':${special_icons[$lang]:-$lang}: :rocket:'
    branches: master
EOF
done

cat ./.buildkite/base-pipeline.yml ${tmpfile}
