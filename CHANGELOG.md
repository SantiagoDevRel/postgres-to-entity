# Changelog

## 1.0.3

- Documentation only; converter, CLI and model output are unchanged.
- README and AGENTS: the sample's wallet writes go through the user's wallet, which gets only the keyless public Rabdi RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`; an access key never goes into a wallet. The README links the Hub access-keys page for the sample server's `ARKIV_ACCESS_KEY` again.
- The release tag carries the sample fix that adds Rabdi to wallets with the keyless RPC only (PR #16).

## 1.0.2

- Verify the SDK ^1.0.0 peer range with 1.0.1; update exact development and consumer SDK pins and current guidance.
- Recognize the updated SDK out-of-gas diagnostic while retaining authoritative receipt checks and the single-retry limit.
- Guard stale SDK guidance while preserving dated evidence and compatibility contracts.

## 1.0.1

- Clarify versioned installation and archive verification; guard source-map metadata and preserve dated evidence.

> Historical version entries below are preserved as recorded; use README.md for the current release.

## 1.0.0

Breaking: output is now arkiv-entity-model/3 for SDK 1.0.0 and Rabdi.

- Replace the previous storage mapping with schema.name and typed schema.columns.
  Each column explicitly declares indexed, source type, encoding and nullability.
- Store binary/JSON/arrays in named bytes columns without an index. Preserve source
  identities and relationships; relationship ordinal is an explicit u64 column.
- Require bounded numeric expirationBlocks in addition to owner and expiration decisions.
  Longer retention requires authorized Lifetime Extension.
- Retain attributeLimits as the explicit queried-text byte-bound input. Validate UTF-8;
  reject oversized data without truncation. Stored source types remain lossless.
- Add offline toSdkSchema and shared converter-contract fixtures.
- Migrate the optional sample to reviewed SDK schema writes, explicit transaction gas,
  latest-state reads and server-only access keys; provide an idempotent Rabdi seed.
- Consume the actual npm archive in the sample and clean-install checks.
