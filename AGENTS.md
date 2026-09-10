# AGENTS.md — POSTGRES-TO-ENTITY

## Purpose and boundaries

`postgres-to-entity` converts PostgreSQL CREATE TABLE definitions into the portable
Arkiv entity model `arkiv-entity-model/2`. Public entry: `src/postgres.ts`.
This npm package is deterministic and offline. Never request database passwords, wallet
keys or network access to generate a model. It does not import rows or perform writes.

The user expanded the **sample only** on 2026-09-10 to allow an optional wallet-confirmed
single-entity creation on Tiramisu. This supersedes the older no-wallet sample boundary.
The other ownership option is explicitly example-only and MUST disable deployment.

## Commands

Node 22.12–23. `npm ci`, `npm test`, `npm run typecheck`, `npm run build`.
`npm pack --pack-destination sample/vendor` produces the consumable archive.
Consumers: `npm install ./postgres-to-entity-0.3.1.tgz` then
`npx postgres-to-entity schema.sql --format markdown --out NEW_FILE.md`.
CLI exit codes: 0 modelled, 2 needs-input, 3 blocked, 1 command/I/O error.
Output uses exclusive creation; never overwrite a developer's edited model.
The public npm archive is distributed through GitHub Releases. Registry publication
requires the maintainer's npm security key; never claim registry availability without checking.

## Required developer inputs

Ask for PostgreSQL CREATE TABLE definitions, query fields/operators, exclusions/privacy,
source identity and relationship expectations, owner and Entity Expiration decisions.
No natural-language query inference. Optional question text is agent context only.
Ask for the actual framework/SDK version before producing implementing app code.

For the sample, connecting an injected wallet is optional. Only request connection on
an explicit click. Test GLM comes from https://hub.arkiv.network/faucet; funding and any
CAPTCHA are human steps. Never request or embed private keys/access keys.

## Hard invariants

- `attributeLimits: [{table,column,maxBytes}]` explicitly bounds queried scalar text fields
  to 1–128 UTF-8 bytes. Preserve the PostgreSQL source type. Reject oversized values; never
  truncate or silently reroute. The sample displays 128 bytes when choosing a text attribute.

- Public input requires sql. Reject schema, other database dialects, mixed formats and
  unsupported SQL statements. JSON request envelopes contain SQL plus decisions; they
  are not JSON Schema or MongoDB adapters.
- Every retained source field has an explicit destination. Compatible queried scalars
  exist only in attributes, not duplicated in payload. Other fields stay in payload.
- Preserve source PK/FK mappings; entity keys are separate. No automatic JOIN, constraints,
  row import, privacy inference, universal SQL support or optimality claims.
- Nullable attributes use omission; reconstruct null only from a complete attribute set.
  Missing non-nullable values are invalid. Zero/false/empty text are not null.
- Exact decimals/bigints use strings. Attribute byte limits are bytes, not characters.
- Advanced array membership is a projection into additional entities, not a native array
  attribute. Keep the complete parent array and only ordinal in relationship payload.
  Require an app consistency decision; the beginner demo leaves arrays in payload.
- Models with blockers are not executable; decisions remain visible in agent exports.
- Sample values are illustrative and must not contaminate the model/agent export. The
  separate row editor is the only source of optional transaction data and requires review.
- Render source identifiers as text. Do not persist schemas, rows or credentials.
- No new skill publication. The public API is the PostgreSQL model converter; do not add
  cost-comparison semantics or alternate database adapters silently.
- Tests must use the actual npm archive in consumers. Read sample/AGENTS.md before UI work.
