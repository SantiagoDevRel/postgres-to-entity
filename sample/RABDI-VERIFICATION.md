# Rabdi release candidate verification - 2026-10-31

Candidate: `postgres-to-entity@1.0.0`, `arkiv-entity-model/3`, SDK 1.0.0.
Registry publication, merge and production promotion require separate review approval.

## Reproducible package checks

`scripts/verify-dgx.sh` runs the release checks and the already-available Node 22
container checks. No testing dependency was added.

- Linux ARM64, Node v24.22.1: 72 engine tests, 21 sample tests, typecheck, lint, package
  build, sample build, archive installation, complete fixture output parity and CLI checks passed.
- Node v22.23.4 on ARM64: the same engine/sample runtime tests, typechecks, library
  build and a separate clean archive consumer passed.
- Shared lane M minimum projections are tested in `src/model-contract.test.ts:7`.
  The clean consumers compare complete JSON output for every shared fixture.
- CLI checks cover unsupported public input, expected draft exit codes and refusal
  to overwrite an existing output file (`scripts/verify-release.mjs:46`).
- Archive SHA-256: `7c44c02ef9f536e8a09ee6e19edb7c23eedbd1188c8235da9513a62cb583bbb1`.
  The sample consumes this exact archive and its matching lockfile integrity.

## Live generated-schema proof

`scripts/seed-rabdi.mjs` consumes the installed archive through
`sample/shared/demo.mjs`, builds the generated SDK schema, and signs only with the
dedicated funded lane wallet injected through the secrets runner.

- [Successful create](https://rabdi.explorer.arkiv.network/tx/0x26f4fdd908f26eb63d9d5b2a6f3c50ef2f5c0ff9ac329f45f379b55e2ce791c5):
  receipt success; gas 364,204 of 1,000,000, retaining more than 2x headroom.
- [Created entity](https://rabdi.explorer.arkiv.network/entity/0xf51b08e585e161309bc6367073dc44cd21b0970af6621b3cebf5904f9366f77a):
  source UUID, indexed i32 score, stored string and stored binary bytes read back;
  an indexed query returned the same entity.
- The create accepted the bounded 7,883,970-block duration. Repeating the seed
  performed zero writes and returned the same entity.
- [Intentional over-limit probe](https://rabdi.explorer.arkiv.network/tx/0x8211512514248590e606081cdf104b5d9aedb8e7f076e586bcea0bd9a3957837):
  authoritative reverted receipt, `ExpiryBeyondMaxLifetime`, gas 40,820 of 1,000,000.
  This was an expected negative test. No automatic retry or funder signature occurred.

## Large-row gas policy and review regressions

`sample/src/write-policy.ts:13` estimates the exact SDK request through the wallet RPC
at latest, stopping on errors. It supplies a fresh latest nonce and network gasPrice,
uses max(1,000,000, 2 x estimate), and refuses more than half the latest head gas limit.
There are zero automatic retries. Wrapped SDK errors preserve the clear policy reason.
Row data never reaches the application's server read proxy.

- A 70,000-byte row at the maximum lifetime was refused before signing: estimate
  10,884,133, doubled budget 21,768,266, half-head cap 15,000,000. No transaction.
- With an explicit generated one-day decision (43,200 blocks), the
  [live create](https://rabdi.explorer.arkiv.network/tx/0xa71f9f97177d1768cce7c1befaf95673d4d28cefcb63c71e9a480a2563432f51)
  succeeded: estimate 2,908,727; gas limit 5,817,454; gas used 2,884,666; head limit
  30,000,000. TEST_P2E only, nonce 2, network gasPrice 1 gwei, zero retries.
- [The entity](https://rabdi.explorer.arkiv.network/entity/0x8c96dccaf879b52ea1b77139c8bd2f5ef013dd498e4288531219ff7802074a77)
  read back all 70,000 nonzero bytes exactly and matched the indexed score query.
  Repeating the proof and normal seed performed zero writes.
- Regression tests accept a 128-byte relationship schema, block 129 bytes, and block
  the reserved triple-slash project prefix. The deployed archive worker passes the
  same boundaries. Lane M fixtures and full JSON/Markdown output remain byte-identical.
- `scripts/verify-rabdi-lifetime.mjs` now checks failed unsigned estimation without
  signing. The earlier reverted boundary transaction above remains historical proof.

## Preview and browser checks

Existing project: `postgres-to-entity`.
[Review preview](https://postgres-to-entity-ews0vj3q0-golem.vercel.app), deployment
`dpl_Dd4bPvVo4oTwsk2g3VFKfM4BtYW2`. It retains the project's existing Vercel authentication.

- A hydrated browser displayed the real seeded Rabdi entity through the fixed,
  owner-filtered server endpoint. Responses use `Cache-Control: no-store`.
- All four examples converted and exported the current model, without illustrative
  values in exports. Edited row values followed indexed/stored/excluded destinations.
- An isolated browser context exercised two simulated wallet transactions: explicit
  nonce, gas and current gasPrice; exact typed/indexed wire values; rejection, funding,
  consent invalidation, uncertain-write lock, and read-only receipt reconciliation.
  A 70,000-byte row uses twice its exact unsigned estimate; failed estimates and
  half-head-budget violations send nothing. An uncertain no-hash result also locks
  resubmission and blocks alternate SDK send methods.
  No real browser-wallet transaction was sent. Live signing is the separate proof above.
- Twenty dark/light viewport probes passed at 320, 390, 519, 520, 521, 682, 683, 684,
  768 and 1440 pixels. Screenshots and computed typography were inspected; zoom 200%
  and global overflow checks passed. JavaScript page errors: zero.
- Real SDK chain/fee requests passed through the deployed read proxy. Eleven direct
  source/credential-path probes returned non-200 responses. Writes, arbitrary queries
  and historical-state requests were rejected with 400 responses.
- Deployed JavaScript was checked for stored secret values: none found. A raw URL
  regex flagged Ox's adjacent minified docs-origin/version templates; its exact public
  `defaultStaticOptions` source confirmed the false positive. No scanner was disabled.

## Improvement observed

Not blocking this candidate: the gas-budget refusal could link directly to Entity
Expiration so users can review a shorter bounded duration. The live proof showed
that the same 70 KB row fits with one day while the maximum duration exceeds the
safe gas budget. The current message clearly refuses and suggests splitting or
reducing the row before any signing.
