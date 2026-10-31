#!/bin/sh
set -eu

npm ci --ignore-scripts --no-audit --no-fund
node scripts/verify-release.mjs "$@"
docker run --pull=never --rm \
  --user "$(id -u):$(id -g)" \
  --env npm_config_cache=/cache \
  --mount "type=bind,source=$PWD,target=/work" \
  --mount "type=bind,source=$AGENT_JOB_DIR/npm-cache,target=/cache" \
  --workdir /work \
  node:22-alpine node scripts/check-node22.mjs "$@"
