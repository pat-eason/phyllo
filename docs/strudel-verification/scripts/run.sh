#!/bin/sh
# usage: run.sh script.mjs  (runs with cwd=scripts, module resolution into ../pkgs/node_modules)
D=$(cd "$(dirname "$0")" && pwd)
NODE_PATH="$D/../pkgs/node_modules" exec node --import "$D/register.mjs" "$@"
