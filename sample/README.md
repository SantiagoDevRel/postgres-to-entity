# postgres-to-entity sample

PostgreSQL schema to SDK 1.0 typed columns, with an optional reviewed wallet write on Rabdi.
The browser consumes vendor/postgres-to-entity-1.0.0.tgz, not sibling source.

## Run

Node 22.12-23. From this directory: npm ci; npm run build; npm run dev.
Default URL: http://127.0.0.1:3083. API functions run on the Vercel preview; offline
conversion also works without server configuration. Historical verification reports
in this folder describe earlier releases, not this migration's acceptance evidence.

## Workflow

1. Choose an example or paste PostgreSQL CREATE TABLE definitions.
2. Choose stored, indexed or excluded source fields. No query inference. Arrays stay
   in stored bytes columns. Queried text has an explicit 128 UTF-8 byte bound.
3. Choose ownership and a future local date within 7,883,970 nominal two-second blocks
   (about 182 days). Longer retention requires authorized Lifetime Extension.
4. Inspect typed columns and source mappings. Copy/download the model and decisions.
5. Optionally connect a wallet, review/edit one source row, and explicitly confirm
   public values and SQL-rule review. Another wallet is example-only and cannot deploy.
   JSON fields use {value:...}; SQL NULL is null. Arrays use {values,lowerBounds}.

Schemas/rows remain in browser memory and are not persisted or uploaded for conversion.
Illustrative values are separate from exports. The row editor is the only source of
transaction values. Changing data/account/network invalidates consent.

## Rabdi reads and writes

The existing Vercel project is postgres-to-entity. Server environment:
ARKIV_ACCESS_KEY (read Key B), P2E_SAMPLE_OWNER (the public seed wallet address).
api/rpc.mjs accepts only bounded explicit read methods; it rejects writes, arbitrary
queries and old-state requests. api/sample.mjs queries one fixed public seed identity
and owner. Neither endpoint returns an access key or upstream transport error.

Wallet writes use the Rabdi RPC already configured in the user's wallet. Get a free
access key at https://hub.arkiv.network/access-keys and test GLM at
https://hub.arkiv.network/faucet. Never provide private keys to the browser.
Creation estimates the exact unsigned SDK request through the wallet RPC at latest,
stopping on errors. It supplies a fresh nonce (latest), network gasPrice, and
gas=max(1000000n,2*estimate), capped at 50% of the latest block gas limit. Larger rows
are refused with a split/reduce message. It checks a successful receipt and compares
all submitted typed columns on readback. Row data never enters the server read proxy.
An uncertain transaction blocks resubmission, including when no hash returns. A revert at the gas
limit permits one retry only when the SDK itself reports the confirmed revert and
the receipt gasUsed equals the sent limit. That retry doubles prior gas, re-estimates
at latest and retains the half-head cap. Every other revert is terminal. Operations
are tracked by signer/source identity across renders and clicks, with at most two
attempts ever. SDK success, uncertain sends and null/disagreeing later receipts never
reopen a send. If state
reads report 'arkiv serves state at the chain head only', use latest or pending.

## Reseed and verify

From the repository root, inject ARKIV_ACCESS_KEY_A and TEST_P2E wallet via the secrets
runner, then run node --experimental-strip-types scripts/seed-rabdi.mjs. It queries the fixed source identity and
owner before creating, verifies the generated schema on chain, and checks a successful
receipt. A repeated seed performs zero writes. It never uses the funder.

Root verification builds/packs first, then installs the archive here and runs build,
row/query-guide/API tests. Browser checks use a separate Chrome window and simulated
wallet boundaries; live seed evidence is reported separately from wallet simulation.
