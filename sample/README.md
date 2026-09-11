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
node --experimental-strip-types --test scripts/row.test.ts scripts/query-guide.test.ts
```

Default dev/preview: http://127.0.0.1:3083. The current review preview uses 3085.
Strict port selection; do not kill other processes to obtain a port.

The sample consumes `vendor/postgres-to-entity-0.3.1.tgz`; it does not import sibling source.
SDK 0.8.0 and viem are confined to the optional wallet demo. The npm model engine is offline.

## Workflow

The horizontal Schema → Fields → Entity navigation shows one step at a time. Completed
steps remain available; controls stay mounted so going back preserves edits. Changing SQL
invalidates the following steps. Blocker links and native invalid inputs reveal their step
and any collapsed settings before focusing the field.

1. Paste PostgreSQL CREATE TABLE definitions or open a .sql file. Read the schema.
2. Choose payload, queryable attribute or exclusion per source field. Destination changes
   refresh the mapping automatically. Expand Available filters for every supported predicate
   for the mapped type as compact names; no operator is selected or enabled.
   Numeric attributes support equality and ordered comparisons; strings equality and prefix;
   booleans equality. AND/OR/NOT compose conditions. NOT includes missing attributes.
   Unsupported ne/exists/hasType and string pattern features are labelled unavailable. Arrays
   stay in payload in this beginner UI; array query projections remain an advanced agent task.
   Hover, focus or tap either concept card for a compact visual excerpt:
   attributes above payload JSON, highlighting the section being explained. It follows the
   first table's selected fields and uses illustrative values, never transaction data.
   These are illustrations, not explorer links to deployed entities. The main entity preview
   shows attribute types without repeating source paths such as Field: tickets.event_name.
3. Choose Connected wallet or Another wallet (example only), and a local calendar date/time.
   Another wallet cannot deploy; it remains useful for explaining a proposed model.
4. See your entity: compare Attributes and Payload side by side. Expand the field mapping
   or system metadata when needed. Inspect the complete entity
   illustration and payload JSON. Set readonly and permissionlessExtension using the
   Creation flags true/false controls. Both default to false and apply to actual creation.
   The final collapsed handoff copies/downloads the model plus per-type creation settings
   in Markdown. The portable model JSON stays unchanged and excludes demo settings.
5. The primary **Deploy to Tiramisu** action opens **Try it on Tiramisu** to optionally review/edit one JSON source row, confirm its public fields and values together, connect your injected
   EVM wallet and click Deploy to Arkiv. The wallet confirms creation on Tiramisu.
   **Copy & paste to your agent** is secondary, below the testnet section and collapsed by
   default. A new schema closes an earlier handoff. Opening the review does not send a transaction.
   Below the row editor, **Your values → Arkiv entity** shows the actual encoded attributes
   and JSON payload in separate areas. It updates with edits and mapping changes, and clears
   on invalid input or a stale model. It uses the same prepareRow output as creation.
   The creation-settings label includes a decorative flag icon for workshop recognition.

Schema JSON/MongoDB imports are not accepted. A JSON **row editor** at the final step contains
actual field values, not a schema. A JSON model download is output, not a source format.
Arkiv itself also accepts text and binary payloads. This PostgreSQL demo deliberately encodes
the remaining columns as JSON; its row editor therefore requires a JSON object.

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

Creation flags persist per entity type across mapping rebuilds and reset with a new schema.
Changing either flag clears confirmation. Both controls lock during signing; the transaction
uses a snapshot and readback verifies both booleans. readonly freezes attributes and payload;
permissionlessExtension lets anyone extend expiration. Neither flag can change after creation.
Project namespace is the custom `ds` attribute. createdAt/updatedAt are block numbers:
they begin at the creation block, and updatedAt tracks the latest content patch.

The UI says Project name (`ds`), Lock the content (`readonly`), and Let anyone extend
expiration (`permissionlessExtension`). Boolean values and SDK mappings remain unchanged.
The concept examples update with the actual selected source fields. No illustrative value
is copied into the exported model.

Navigation verification: a host with Playwright can call `verifyJourney(browser, output, url)`
from `scripts/verify-journey.mjs`. Wallet regressions remain in `scripts/verify-browser.mjs`.
`scripts/verify-concepts.mjs` covers visual help, keyboard/touch, responsive geometry and the
primary deploy-to-review action. The host supplies Playwright; no added test dependency.
`scripts/verify-row-preview.mjs` checks the actual values shown before signing, destination
changes, exclusions, invalid-input clearing, responsive geometry and the flag icon.

Disabled deployment lists concrete model blockers or the offending row value immediately above
the button, with a review action. Unsupported requested mappings remain labelled blocked in the
comparison instead of appearing to move into payload. One final confirmation covers fields and
row values for the optional write. The exported model keeps its privacy decision for the agent;
the demo never represents that local confirmation as global approval for future rows.
Changing destinations preserves edited values by source field and resets confirmation.
Changing inputs clears old status messages and collapses an earlier receipt under Previous creation.

Selecting a text attribute explicitly adds an `attributeLimits` contract of 128 UTF-8 bytes.
The UI displays it at the field and validates actual byte length before sending. Values are
never truncated or hashed. PostgreSQL source types/bounds remain unchanged. Moving the field
back to payload removes that attribute limit. Payload and transaction limits still apply.

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
