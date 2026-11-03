#!/bin/sh
set -eu
node --test scripts/isolated-checkout.test.mjs
sh scripts/verify-dgx.sh
node scripts/sdk-runtime-check.mjs
node scripts/sdk-peer-check.mjs
node scripts/sdk-guidance-mutation.mjs
node scripts/inspect-pack.mjs
node scripts/vocabulary-build-mutation.mjs
