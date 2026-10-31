#!/bin/sh
set -eu
node -e 'if(process.versions.node.split(".")[0]!=="22")throw Error("Run this gate in the DGX Node 22 environment")'
npm ci --ignore-scripts --no-audit --no-fund
(cd sample && npm ci --ignore-scripts --no-audit --no-fund)
node scripts/verify-release.mjs "$@"
node scripts/check-node22.mjs "$@"
