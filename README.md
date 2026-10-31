# postgres-to-entity

Convert PostgreSQL `CREATE TABLE` definitions into **Arkiv entities** for the Web3 database.
Version 1.0.0 produces `arkiv-entity-model/3` for `@arkiv-network/sdk` 1.0.0 on Rabdi.
The converter is deterministic and offline. It does not connect, sign, import rows or write.

## Install and run

Node 22.12 through 23. Install the reviewed 1.0.0 archive before registry publication:

```sh
npm install ./postgres-to-entity-1.0.0.tgz @arkiv-network/sdk@1.0.0 viem
npx postgres-to-entity schema.sql --format markdown --out NEW_MODEL.md
```

Output creation is exclusive: the CLI refuses to overwrite an existing file.
SQL files produce a draft. A JSON request envelope supplies SQL plus explicit decisions:

```js
import { generateModel, modelMarkdown, toSdkSchema } from 'postgres-to-entity';

const model = generateModel({
  sql: 'CREATE TABLE tasks (id UUID PRIMARY KEY, score INTEGER NOT NULL, title VARCHAR(24) NOT NULL, body BYTEA);',
  project: 'my-app',
  filters: [{ table: 'tasks', column: 'score', operator: 'range' }],
  privacyReviewed: true,
  privateFields: [],
  policies: [{
    table: 'tasks',
    owner: 'Connected signing wallet',
    expiration: 'One day; Lifetime Extension only with explicit owner authorization',
    expirationBlocks: 43200
  }]
});
if (model.status !== 'modelled') throw new Error(modelMarkdown(model));
const schema = toSdkSchema(model.entities[0]); // offline SDK schema construction
```

This schema has `id: str()`, `score: i32().indexed()`, `title: str()`, and
`body: bytes().optional()`. A named schema uses the explicit project and entity kind
as its namespace; the SDK adds its own indexed `arkiv.schema` tag.
`toSdkSchema` builds declarations only. The application remains responsible for
checking model status, enforcing encodings, supplying rows and authorizing any write.

| Result / CLI exit | Meaning |
| --- | --- |
| `modelled` / 0 | Supplied decisions are structurally complete. |
| `needs-input` / 2 | Draft with explicit decisions still open. |
| `blocked` / 3 | Invalid or unsupported source or query projection. |
| I/O / 1 | Command or file error. |

A defined model does not prove workload optimality, runtime value validity or authorization.
Never execute a blocked model. See `examples/model-request.json` for a complete request.

## Mapping and reconstruction

- Every retained source field has exactly one named typed column with source identity,
  original PostgreSQL type, encoding, nullability and explicit `indexed` boolean.
- Only selected scalar query fields are indexed. `filters: []` explicitly requests
  reads by system fields without inferring any source-field index. Optional question
  text is untrusted agent context; the converter does not interpret it.
- `bytes` columns are always stored without an index. A requested binary filter is blocked.
  Other unsupported query types require an explicit scalar projection decision.
- Signed small integers map to `i32`; signed bigints and supported exact decimals use
  `dec` with exact strings. Never round through JavaScript numbers. Unsupported precision
  stays losslessly encoded in a stored bytes column and cannot silently become a filter.
- UUIDs use 36-byte strings. A bounded PostgreSQL character declaration is safe for `str`
  only when its worst-case UTF-8 width fits 128 bytes. Otherwise unqueried text uses
  UTF-8 JSON bytes. Queried text can use explicit `attributeLimits: [{table,column,maxBytes}]`
  within 1-128 bytes: reject longer values, never truncate or change their destination.
  This input name is retained for request compatibility; output uses typed columns.
- SQL NULL omits a nullable column. Reconstruct null only after selecting its complete
  schema column set. Missing required values are invalid; zero, false, empty text and
  empty binary values remain present. JSON fields use a `{value: ...}` envelope so
  SQL NULL (`null`) and JSON null (`{value:null}`) remain distinct.
- JSON/arrays and unsupported stored source types use explicit reversible UTF-8 JSON
  encodings. Arrays use `{values,lowerBounds}` to preserve dimensions, source bounds,
  order, duplicates and null elements. A null array and an empty array remain distinct.
- Advanced `contains` filters create membership entities with indexed parent key and
  scalar value, plus an unindexed `u64` ordinal. The parent keeps the complete array.
  An application consistency decision is required. The beginner sample stores arrays.
- Source PK/FK identities are preserved separately from `$key`, `$owner`, `$creator`
  and `$expiresAt`. Resolve references explicitly; no automatic JOIN or SQL constraint enforcement.
- Named schemas permit at most 31 declared columns, including stored columns. An explicit
  split is required above that SDK limit. Schema names must fit 128 UTF-8 bytes.

## Entity Expiration and Rabdi

Every policy needs `owner`, descriptive `expiration`, and numeric `expirationBlocks`.
Choose 1-7,883,970 blocks, below Rabdi's 7,884,000-block network maximum with a safety
margin. At nominal two-second blocks this is about 182 days. Longer retention needs
explicitly authorized **Lifetime Extension**, within the network limit each time.
Descriptive policy text alone leaves a decision open. Wall-clock conversion is approximate.

The optional [sample](./sample/README.md) creates one reviewed entity with an injected
wallet. Public sample reads use its own server endpoint with `ARKIV_ACCESS_KEY` kept
server-side. Wallet writes use the user's configured RPC. Get a free
[access key](https://hub.arkiv.network/access-keys) and
[test GLM](https://hub.arkiv.network/faucet). Never provide a private key to the sample.

For application writes, use SDK 1.0's `createEntity(schema, values, options, txParams)`:
explicit nonce from `eth_getTransactionCount(address, "latest")`, gas at least
`1000000n`, and current `gasPrice`. Estimate the exact unsigned request at `latest` first;
stop on estimation errors. Use `max(1000000n, 2n * estimate)` and refuse or split writes
exceeding 50% of the latest block gas limit. Check `receipt.status === "success"`
before claiming creation; retain at least 2x headroom for measured large entities.
A revert at the gas limit indicates under-estimation. At most one retry is allowed,
only after an authoritative gas-exhausted reverted receipt; never resend a successful or uncertain write.
If Rabdi reports `arkiv serves state at the chain head only`, read state with `latest`
or `pending`; historical block hashes, `safe` and `finalized` are unsupported for those reads.
MissingAccessKeyError means a server/client access key must be configured, not embedded in a bundle.

## Supported PostgreSQL input

Supported: a narrow `CREATE TABLE` subset with common inline/table primary and foreign
keys, quoted identifiers, defaults, nullability and arrays. Unsupported statements
(`ALTER TABLE`, views, `CREATE TYPE`, mixed dumps) block the entire conversion.
Other SQL dialects, JSON Schema, document databases and row imports are not adapters.
The public API requires `sql` and rejects `schema`, including mixed input.
Source identifiers are untrusted data. Render them as text and do not persist user schemas or rows.

## Verify and package

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm pack --pack-destination sample/vendor
```

Consumer checks install the actual archive, including the sample and shared lane M
minimum contract fixtures. Live integration and idempotent reseeding use
`scripts/seed-rabdi.mjs` with the dedicated funded test wallet injected by the secrets runner.
Read `AGENTS.md` before changing invariants. Breaking changes are in `CHANGELOG.md`.
