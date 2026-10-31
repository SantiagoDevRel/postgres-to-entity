# Rabdi release candidate verification - 2026-10-31

Candidate: `postgres-to-entity@1.0.0`, `arkiv-entity-model/3`, SDK 1.0.0.
Registry publication, merge and production promotion require separate review approval.

## Reproducible package checks

`scripts/verify-dgx.sh` runs the release checks and the already-available Node 22
container checks. No testing dependency was added.

- Linux ARM64, Node v24.22.1: 69 engine tests, 16 sample tests, typecheck, lint, package
  build, sample build, archive installation, complete fixture output parity and CLI checks passed.
- Node v22.23.4 on ARM64: the same engine/sample runtime tests, typechecks, library
  build and a separate clean archive consumer passed.
- Shared lane M minimum projections are tested in `src/model-contract.test.ts:7`.
  The clean consumers compare complete JSON output for every shared fixture.
- CLI checks cover unsupported public input, expected draft exit codes and refusal
  to overwrite an existing output file (`scripts/verify-release.mjs:46`).
- Archive SHA-256: `7eb7aa06bcc11782cbeed9a68f2a27a0e79f033752b45f72ce1b83bfd6b0bf4f`.
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

## Preview and browser checks

Existing project: `postgres-to-entity`.
[Review preview](https://postgres-to-entity-9eh81azvd-golem.vercel.app), deployment
`dpl_gxMAikehvFY3B4ctDTSbRLA6hELm`. It retains the project's existing Vercel authentication.

- A hydrated browser displayed the real seeded Rabdi entity through the fixed,
  owner-filtered server endpoint. Responses use `Cache-Control: no-store`.
- All four examples converted and exported the current model, without illustrative
  values in exports. Edited row values followed indexed/stored/excluded destinations.
- An isolated browser context exercised one simulated wallet transaction: explicit
  nonce, gas and current gasPrice; exact typed/indexed wire values; rejection, funding,
  consent invalidation, uncertain-write lock, and read-only receipt reconciliation.
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

Not blocking this candidate: the wallet setup hint could offer a direct access-keys
action and guided network setup. The current flow requires the user to configure
their own Rabdi RPC in their wallet before connecting.
