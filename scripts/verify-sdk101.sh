#!/bin/sh
set -eu
node --test scripts/isolated-checkout.test.mjs scripts/vocabulary-build-check.test.mjs
sh scripts/verify-dgx.sh
node scripts/sdk-runtime-check.mjs
node scripts/sdk-peer-check.mjs
node scripts/sdk-guidance-mutation.mjs
node scripts/inspect-pack.mjs
node scripts/vocabulary-build-check.mjs
