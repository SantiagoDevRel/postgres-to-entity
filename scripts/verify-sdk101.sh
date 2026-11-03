#!/bin/sh
set -eu
sh scripts/verify-dgx.sh
node scripts/sdk-runtime-check.mjs
node scripts/sdk-peer-check.mjs
node scripts/sdk-guidance-mutation.mjs
node scripts/inspect-pack.mjs
node scripts/vocabulary-build-mutation.mjs
