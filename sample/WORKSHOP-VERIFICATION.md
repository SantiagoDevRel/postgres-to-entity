# Workshop controls — 2026-09-10

- Compact filter names; no per-field prose, query examples or nullable/duplicate labels.
- Namespace visibly labelled ds. It is a custom attribute, not built-in entity metadata.
- Creation flags readonly/permissionlessExtension default false, independently selectable.
  Selected values persist per type through rebuilds, enter transaction preview and Markdown
  agent handoff, clear confirmation on change, lock during signing, and are checked on readback.
  The offline npm engine and portable model JSON remain version 0.3.1, unchanged.
- SDK 0.8 ABI fixture verifies all four flag bytes (0/1/2/3), receipts and readback;
  seven simulated creations total, plus rejection, missing funds and uncertain receipt retry.
- Build and 14 row/filter tests pass. Isolated Chromium: 320, 390, 519/520/521,
  668/669/670, 682/683/684, 768 and 1440 widths; dark/light, CSS zoom 200%,
  equal panel widths and no page overflow. Physical devices and browser-menu zoom untested.
- Read-only Tiramisu check of entity
  `0x42f225b8fe53a91a6b778259210a1c7f5b0132bde897534c6b6d31717389e703`:
  createdAt = updatedAt = 253545, both flags false. No new real transaction or fee.
- The same browser suite passed on https://postgres-to-entity.vercel.app after production
  deployment `dpl_DA5W198m8zr2gdFSPNYp9aJg3b2n`, asset `index-BSsJM-Ea.js`.
  Sensitive paths .env, keys.json, src/main.ts, package.json, config.json and vercel.json
  return 404. Codex coverage check confirmed all five requested items.
- Semantics verified against official SDK docs:
  https://docs.arkiv.network/typescript-sdk/api-reference/main/type-aliases/creationflags/
  https://docs.arkiv.network/typescript-sdk/api-reference/main/classes/entity/#updatedat
