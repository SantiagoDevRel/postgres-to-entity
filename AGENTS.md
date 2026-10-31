Edit instructions only in AGENTS.md; CLAUDE.md only imports this file.

# AGENTS.md - postgres-to-entity 1.0

## Purpose

Public entry: src/postgres.ts. Deterministic offline PostgreSQL CREATE TABLE converter.
Output is arkiv-entity-model/3 with sdkVersion 1.0.0. toSdkSchema constructs SDK
column declarations offline; generation never connects, signs, imports or writes.
The optional sample separately supports one explicitly reviewed wallet write on Rabdi.

## Inputs and invariants

Ask for SQL definitions, explicit query fields/operators (or filters: []), privacy
review/exclusions, source identity/relationships, owner and bounded Entity Expiration.
Optional question text is agent context only. Ask for actual framework/SDK before app code.
Reject public schema inputs, other dialects, unsupported SQL and mixed formats.

Every retained source field has one named schema column with original source type,
encoding, nullability and explicit indexed boolean. Only selected filter columns are
indexed. bytes is never indexed. Use named stored columns for other data; preserve
PK/FK identity separately from $key, $owner, $creator and $expiresAt. No automatic
JOIN, row import, privacy inference, SQL constraint enforcement or optimality claim.

Nullable columns omit SQL NULL. Reconstruct it only from a complete schema selection;
missing required values are invalid. False, zero and empty values are present.
Exact bigints/decimals remain strings. JSON uses {value:...} to distinguish SQL NULL
from JSON null. Arrays use {values,lowerBounds}; preserve dimensions, order, duplicates,
source bounds and null/empty distinctions. Advanced membership requires parent/value/
ordinal columns and an explicit consistency decision; the sample stores arrays.

attributeLimits is the compatible input name for explicit queried text limits of
1-128 UTF-8 bytes. Preserve the source type, reject oversized data, never truncate
or silently reroute. Named schemas allow 31 columns and 128-byte schema names,
including relationship schemas. Project names cannot use the reserved /// prefix.
Blocked models are never executable; unresolved decisions remain in JSON/Markdown.

Policies preserve owner and descriptive expiration and require expirationBlocks
within 1-7,883,970. The network maximum is 7,884,000 blocks. Longer retention requires
authorized Lifetime Extension. Do not offer an unlimited lifetime option.

## Sample and security

Read sample/AGENTS.md before sample changes. Only connect on click. Wallet writes use
the user's configured Rabdi RPC; reads use the application's bounded server proxy.
Access keys stay server-side as ARKIV_ACCESS_KEY. Free keys: https://hub.arkiv.network/access-keys;
test GLM: https://hub.arkiv.network/faucet. Never request private keys or wallet secrets.
Never persist or upload user schemas or rows. Render identifiers as text.
Illustrations never enter model exports or transaction data; only the reviewed row editor does.

Estimate the exact unsigned request at latest; stop on errors. Every write passes
fresh nonce from latest, current gasPrice and gas=max(1000000n,2*estimate), never above
50% of the latest block gas limit. Split or refuse oversized writes before signing.
Check receipt.status === success. A revert at the gas limit requires more gas.
Never retry a successful/uncertain write. Rabdi head-only state errors require latest
or pending for state reads. Keep exact SDK calls grounded in installed 1.0.0 source.

## Verification and release

Node 22.12-23. npm ci; npm test; npm run typecheck; npm run lint; npm run build.
npm pack --pack-destination sample/vendor. Consumers must test the actual archive.
CLI exits: 0 modelled, 2 needs-input, 3 blocked, 1 I/O error. Output creation is exclusive.
Unit tests preserve parser/privacy/identity/null/byte-bound regressions and lane M fixtures.
Live reseeding: scripts/seed-rabdi.mjs, TEST_P2E wallet only, secrets runner injection.
A network reset may require reseeding; never delete another entity or resource.
First delivery is branch/PR, packed archive and sample preview. Publication, merge and
production promotion require a separate review approval. Do not claim registry availability
until npm view confirms it. No new skill publication or alternate database adapters.
