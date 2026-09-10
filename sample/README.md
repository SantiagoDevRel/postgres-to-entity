# POSTGRES-TO-ENTITY sample

PostgreSQL schema → model → optional reviewed row → one Arkiv entity on Tiramisu.
Four examples: event tickets, social network, to-do list and notes. All use PostgreSQL.

## Run

Node 22.12–23:

```sh
npm ci
npm run dev
npm run build
npm run preview
node --experimental-strip-types --test scripts/row.test.ts
```

Default dev/preview: http://127.0.0.1:3083. The current review preview uses 3085.
Strict port selection; do not kill other processes to obtain a port.

The sample consumes `vendor/postgres-to-entity-0.3.0.tgz`; it does not import sibling source.
SDK 0.8.0 and viem are confined to the optional wallet demo. The npm model engine is offline.

## Workflow

1. Paste PostgreSQL CREATE TABLE definitions or open a .sql file. Read the schema.
2. Choose payload, queryable attribute or exclusion per source field. Attribute query
   intentions use plain-language examples and an official documentation link. Arrays
   stay in payload in this beginner UI; array query projections remain an advanced agent task.
3. Choose Connected wallet or Another wallet (example only), and a local calendar date/time.
   Another wallet cannot deploy; it remains useful for explaining a proposed model.
4. Review public fields, build the model, compare destinations, inspect the complete entity
   illustration and payload JSON. The final collapsed handoff copies/downloads the model.
5. Optionally review/edit one JSON source row, confirm its public values, connect your injected
   EVM wallet and click Deploy to Arkiv. The wallet confirms creation on Tiramisu.

Schema JSON/MongoDB imports are not accepted. A JSON **row editor** at the final step contains
actual field values, not a schema. A JSON model download is output, not a source format.

## Ownership, expiration and public writes

The wallet that signs the creation owns the entity. There is no custom recipient, ownership
transfer, private-key field, automatic background creation or mainnet selection.
The other ownership option is example-only and blocks creation.

A datetime-local picker uses the browser's local timezone. The selected date becomes an ISO
policy in the model and SDK `ExpirationTime.atDate` in the transaction. Arkiv stores an
expiration block; SDK conversion uses its nominal block interval, so this is not an exact
wall-clock guarantee. The actual expiration block is included in the returned entity.

Connect wallet checks/switches/adds Tiramisu (7738577), validates the public RPC chain ID and
uses the injected EIP-1193 provider. Test GLM: https://hub.arkiv.network/faucet. Funding/sign-in
and CAPTCHA are human steps. No access key is required for the public RPC.
The zero-balance check catches an unfunded wallet; the wallet still estimates/validates gas
and may reject an insufficient nonzero balance. Fees are not estimated by this tool.

Source rows are encoded using the model's mappings with the official SDK. Compatible scalar
attributes are not copied into payload. Nullable attributes omit explicit null; missing input
fields are rejected. Bigints/decimals must use exact strings. Decimal previews use the SDK's
canonical value (e.g. 12.50 becomes 12.5). Dates and timestamps are validated without inventing
a timezone. Unsupported row encodings report a local error before signing.

The model preserves SQL constraints/defaults/uniqueness rules. Arkiv does not execute them.
For a one-row demo with such rules, an additional visible acknowledgement requires the user
to check the row against those rules; defaults are never silently filled. This does not turn
the model into verified SQL equivalence or a bulk migration.

Inputs/account/network changes invalidate reviewed data. A final guard checks them again before
sending. Rejection clears consent. A submitted transaction with uncertain receipt is retained
with its explorer and a Check confirmation again action; checking does not resubmit it.

Creation displays transaction/entity Block Explorer links and a Data Explorer entity-key query.
The latter opens the query; select Tiramisu and Execute. A direct SDK read also compares key,
owner, creator, content type, attributes and payload with the submitted values. A failed read
is reported separately from a confirmed creation. The result shows returned system metadata.

## Data boundaries and verification

No schema/row persistence, database credentials, remote LLM, backend or server secrets.
Schemas run in a worker (100 KiB, 8-second timeout). Row input is limited to 100 KiB.
Only reviewed values are sent on explicit wallet confirmation. Model exports never include
illustrative or edited row values. All untrusted identifiers use textContent.

`scripts/verify-browser.mjs` accepts a host Playwright page and owns an isolated browser context.
It tests the production bundle with an injected fixture wallet and intercepted JSON-RPC,
decodes actual SDK calldata and verifies SDK event/read decoding. This is **not a real testnet
transaction**. Live RPC and external explorer checks are documented separately in VERIFICATION.md.
Do not present simulated receipts or keys as live evidence.
