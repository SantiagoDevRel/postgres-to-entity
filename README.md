# POSTGRES-TO-ENTITY

Convert PostgreSQL `CREATE TABLE` definitions into an **Arkiv entity model**.
The package name is `postgres-to-entity`. The deterministic library and CLI run offline:
no database credentials, row import, wallet or chain writes. The optional browser sample
adds an explicitly confirmed, single-entity Tiramisu demo using the official SDK.

## Install and run

Install the versioned npm package archive from GitHub Releases. Registry publication
is pending the maintainer's npm security-key authentication; the archive works with npm.
Node 22.12–23:

```sh
npm install https://github.com/SantiagoDevRel/postgres-to-entity/releases/download/v0.3.1/postgres-to-entity-0.3.1.tgz
npx postgres-to-entity schema.sql --format markdown --out entity-model.md
```

The SQL file contains definitions, for example:

```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  event_name VARCHAR(24),
  seat_number INTEGER,
  used BOOLEAN
);
```

The CLI also accepts a JSON **request envelope containing `sql` and decisions**; this is
not a JSON Schema/MongoDB input adapter. See `examples/model-request.json`.

```js
import { generateModel, modelMarkdown } from 'postgres-to-entity';
const model = generateModel({
  sql: 'CREATE TABLE tickets (id UUID PRIMARY KEY, used BOOLEAN);',
  project: 'event-tickets',
  filters: [{ table: 'tickets', column: 'used', operator: 'eq' }],
  privateFields: [],
  privacyReviewed: true,
  policies: [{
    table: 'tickets',
    owner: 'The connected signing wallet',
    expiration: 'Seven days; the owner may extend later'
  }]
});
console.log(model.status);
console.log(modelMarkdown(model));
```

Output format: `arkiv-entity-model/2`. Model-only is the package boundary, even when
an application consumes it to create actual entities. Do not execute a blocked draft.

| Result / CLI exit | Meaning |
| --- | --- |
| `modelled` / 0 | Structure mapped for the supplied inputs; not a guarantee of workload optimality. |
| `needs-input` / 2 | Draft with explicit decisions still open. |
| `blocked` / 3 | Invalid or unsupported source/projection. |
| I/O / 1 | Command or file error. Output files must not already exist. |

## Supported PostgreSQL input

The parser deliberately supports a subset of PostgreSQL DDL: `CREATE TABLE`, common
inline/table primary and foreign keys, quoted identifiers, defaults, nullability and
array declarations. `ALTER TABLE`, `CREATE TYPE`, views and full `pg_dump` imports are
not supported. Unsupported statements block conversion rather than yielding a partial
model presented as complete. MySQL, MongoDB, CSV and JSON schemas are not public inputs.

The public API requires `sql`; `schema` is rejected, including when mixed with `sql`.
The internal planner retains its earlier normalized representation for existing code,
but it is not an advertised source format of this package.

Supply explicit `filters` with `table`, `column`, and `operator`:

- `eq`: exact-value comparisons, such as an event name or completed flag.
- `range`: numeric comparisons, such as a minimum/maximum price.
- `prefix`: strings starting with a prefix.
- `contains`: advanced array-element projection; creates relationship entities and
  an explicit consistency decision. It is not a native array attribute or a native
  `contains` query operator. The beginner demo leaves arrays in payload.

Operators express intended queries and drive validated encodings; they do not lock an
attribute to one query operator. [Official query documentation](https://docs.arkiv.network/typescript-sdk/querying-data/).
Omitting filters requests a decision; `filters: []` explicitly chooses built-in entity
key lookup/owner filtering only. `question`, if provided by a program, is agent context
only. No natural-language inference happens in the engine.

Other request fields are `project`, `privateFields`, `privacyReviewed`, and `policies`
(table, owner and expiration descriptions). Unknown properties are rejected at runtime.
Names do not prove privacy. Keep private data out of both attributes and payload.

## Storage contract

Compatible scalar query fields live **only in attributes**. Other source fields live
in payload, except explicit exclusions. Reconstruct source rows by merging both using
the model's source mappings, source types and encodings. Preserve source primary keys
and references; they are not Arkiv entity keys. There is no automatic SQL JOIN or
constraint enforcement.

Nullable attributes encode null by omission. Infer null only after retrieving the
**complete** attribute set, never from partial projections. Missing non-nullable values
are invalid. An update to null must explicitly unset its previous attribute. Preserve
zero, false and empty strings. Decimal and bigint encodings use exact strings.

Arrays retain their original payload representation, including order, shape, duplicates
and nulls. Advanced membership projections put the element in a relationship attribute
and only its zero-based row-major `ordinal` in relationship payload. The application must
keep these projections consistent; the package returns that decision explicitly.

The mutable SDK default allows payload and attribute updates. `readonly: true` freezes
both, as a creation flag. Avoiding redundant scalar copies reduces stored bytes and
write work; it does not imply a fixed transaction-price multiplier. No fee quote is
produced. [Flags](https://docs.arkiv.network/typescript-sdk/api-reference/main/type-aliases/creationflags/)
· [Architecture and pricing basis](https://docs.arkiv.network/start-here/fundamentals/).

## Browser sample and wallet demo

See [sample/README.md](sample/README.md). Four understandable PostgreSQL examples,
explicit field destinations, a complete entity illustration, JSON payload and a collapsed
copy/paste handoff. The sample consumes the npm archive, not sibling source files.

A separate optional step encodes one reviewed JSON **row**, connects an injected EVM
wallet and calls SDK 0.8 `createEntity` on Tiramisu. The user confirms the transaction.
Only the connected wallet can deploy. Another wallet is model-only. A date/time picker
sets an approximate calendar expiration via the SDK, ultimately stored as a block.

The demo is not a bulk database migration or proof of PostgreSQL runtime constraints.
Unsupported row encodings and unresolved model decisions block creation. The package
itself remains independent of wallets and the Arkiv SDK.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run build
npm pack --pack-destination sample/vendor
cd sample
npm ci
npm run build
npm run dev
```

`src/postgres.ts` is the public PostgreSQL-only entry; `src/planner.ts` is the internal
mapping engine; `src/sql.ts` reads DDL. This repository contains the PostgreSQL converter
and its sample. No skill installation is required.
The MCP integration uses the same versioned package and remains model-only.

# Text attributes (0.3.1)

For a PostgreSQL text column, explicitly choose a maximum encoded size for the attribute:

```js
generateModel({
  sql: 'CREATE TABLE tickets (id UUID PRIMARY KEY, buyer_email TEXT);',
  filters: [{ table: 'tickets', column: 'buyer_email', operator: 'eq' }],
  attributeLimits: [{ table: 'tickets', column: 'buyer_email', maxBytes: 128 }]
});
```

`attributeLimits` supports scalar text/varchar/character varying fields, 1–128 UTF-8 bytes.
It is an explicit application constraint, not a change to the PostgreSQL schema. Reject longer
values before writing; never truncate, hash, or silently move the value to payload. A payload
field has no attribute-specific byte limit. The sample validates these limits with the SDK.
