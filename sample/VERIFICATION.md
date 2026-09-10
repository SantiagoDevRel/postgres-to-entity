# Public release verification — 2026-09-10 UTC

Deployment-button follow-up (2026-09-10): reproduced a connected wallet with row consent
checked while the model lacked its public-field review. The local and published production
browser suites pass the new regression: explicit reason beside Deploy, keyboard-focus recovery
without accepting consent, preserved edited row after the same mapping is rebuilt, and old
receipt separated from current status. Inspected the blocked state at 390/768/1440 px, light/dark
and 200% CSS zoom. Build and all 8 row tests pass. No additional real transaction or GLM spend.
Production bundle: `index-IBtihTGt.js`; sensitive static paths return 404.

Final independent Claude run: **PASS**, 2026-09-10 05:03:58 UTC. Public MCP General
1.0.14 returned the exact installed archive model and preserved blocked-model reasons
over HTTP. Tools production links, the public-demo receipt/entity and actual Block Explorer
and Data Explorer results all passed. Claude also ran the public 13-width browser suite.
MCP: 269 tests; successful and rejected model telemetry verified through HTTP into storage.
Tools: https://hub.arkiv.network/tools; PRs #122 and #123 merged, staging/production deployments
successful. Only npm registry authentication remains pending; the public package archive works.

- Demo: https://postgres-to-entity.vercel.app
- Source and npm archive: https://github.com/SantiagoDevRel/postgres-to-entity/releases/tag/v0.3.0
- The archive is publicly installable with npm. Registry publication is pending the
  maintainer's physical security-key authentication (CLI E401; web WebAuthn challenge).
- Archive SHA256: `19f865af5d8e27ad9ae6f626ab1194dbbe8e5a39c06c54d72f129c670880e68d`.
  19,004 bytes, 13 entries. Sample and MCP lockfiles pin the same archive.
- Fresh consumer installed the public release URL; ESM API, CLI, correct boolean attributes,
  no duplicate scalar payload fields and unsupported-source rejection passed.
- 57 tests in the standalone public converter repository; typecheck/build passed.
  The original workspace's broader historical suite passed 128 tests. 8 sample row tests passed.
- Public demo regression passed 13 widths: 320/390/519/520/521/668/669/670/682/683/684/768/1440,
  dark/light, computed fonts and 200% CSS zoom. No document overflow or page errors.
  Inspected source/field/deployment screenshots. Physical devices and browser-menu zoom were not tested.
- Fixture tests separately cover four examples, clipboard/export, invalid SQL/row values,
  wallet rejection, no funds, account changes, ownership restrictions, dates, one decoded
  Create operation, readback and uncertain receipt retry without another write.
- Actual Rabby creations (Tiramisu 7738577 only, no transfers):
  - Local preview: https://tiramisu.explorer.arkiv.network/tx/0xb9a5cb236fb5de8619186c12c97c3df1ecb45804b6d0021f6e07c92bd333979b
  - Public demo: https://tiramisu.explorer.arkiv.network/tx/0xed9da77e37390ed6de36d99d6f9addf706751214a4b08a16b129f17b5c7f1133
- Both receipts succeeded and SDK readback matched owner, creator, payload and typed attributes.
  Public demo entity: `0x42f225b8fe53a91a6b778259210a1c7f5b0132bde897534c6b6d31717389e703`.
  Edited row: seat 24, event_name "Workshop demo", used false. Buyer email excluded.
- Each fee: 0.000121497600202496 GLM. Total: **0.000242995200404992 GLM**, confirmed
  by receipt gasUsed × effectiveGasPrice and wallet balance delta; authorized ceiling 2 GLM.
- Claude independently read the first transaction from public RPC and the entity through
  SDK 0.8.0, asserted every mapping and read the actual SUCCESS page in Block Explorer.
- Data Explorer opened the public-demo entity-key link, executed the query and showed
  exactly one matching entity. Calendar expiration is approximate and the entity may expire later.
- Vercel scope golem; static upload uses a deny-all allowlist. `.env`, `keys.json`,
  `src/main.ts`, `package.json` and `vercel.json` return 404 publicly. No credentials uploaded.
- The official Arkiv orange icon is copied unchanged from the canonical logo pack for the favicon.

No universal PostgreSQL support, automatic SQL constraint enforcement, bulk row migration or
workload-optimality claim. The supported subset and unresolved decisions remain documented.
