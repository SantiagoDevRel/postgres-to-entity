# Field editing and filter guide — 2026-09-10

Supersedes the earlier two-checkbox review workflow documented in VERIFICATION.md.

Public demo verified: https://postgres-to-entity.vercel.app, bundle `index-4gdhtQYV.js`.
The full isolated regression passed locally and on this public deployment. Sensitive static
paths (`.env`, keys.json, source files, package.json, config.json, vercel.json) return 404.

- Package 0.3.1 adds explicit `attributeLimits` for SQL text fields. Model source types stay
  intact; the exported `attribute-limit` decision requires enforcement in the consuming app.
  Archive SHA256: `8c101c62b28a77b09ef9a3fe646402c5fb8e0cd6d900c82f284d74408124f17d`.
- The sample displays the 128 UTF-8 byte limit, measures the exact value before encoding,
  rejects overflow without truncating, and removes the attribute limit for payload fields.
- Destination changes regenerate the mapping. The JSON editor preserves shared source values;
  excluded fields are removed from the current editor/cache. Invalid JSON stays visible.
- One final confirmation covers fields and values for one public write. Privacy and byte-limit
  implementation decisions remain in the exported design. No automatic approval or signing.
- A blocked requested attribute is visibly blocked in the comparison. Deploy lists exact issues
  and links to the issue list; each field issue has an Edit field action with keyboard focus.
- Available filters replace the exclusive operator selector. Numeric: eq/gt/gte/lt/lte plus
  an AND range example; string: eq/startsWith; boolean: eq. All support NOT composition, with
  the missing-attribute caveat. AND/OR/NOT combinations and unavailable operators are explained.
- Read-only requests against Tiramisu accepted eq, gt/gte/lt/lte, AND, OR, NOT, starts-with
  and boolean equality. The node rejected !=, exists, typeof and LIKE, matching the query-syntax
  documentation. These probes verify acceptance, not exhaustive query semantics.
- Validation: 60 standalone converter tests (131 in the historical workspace), 14 sample tests,
  typecheck/build, matching archive/lockfile integrity, and isolated browser regression.
  The regression encodes three fixture creations, including buyer_email `test@gmail.com` as
  an attribute, decodes actual SDK calldata, and verifies fixture receipts and readback.
- UI regression: 13 widths from 320 to 1440, including breakpoint boundaries; inspected filter
  and limit states at 390/768/1440, dark/light, computed fonts and 200% CSS zoom. Physical devices
  and browser-menu zoom were not tested. No document overflow or page errors.
- Claude supplied an independent design review from inline code after the normal wrapper
  timed out. Incorporated its findings on excluded values, invalid JSON, nullable attributes,
  explicit application limits, single-write consent and concrete blockers. Claude did not run
  the browser or tests in this follow-up. The checklist wrapper failed to launch its Codex shim
  (rc=126); the primary agent checked each of the eight requested items against code and tests.
- No additional real wallet transaction, transfer or GLM spend. Earlier real Tiramisu receipts
  are documented in VERIFICATION.md and are not evidence of this new simulated test.

Sources: https://docs.arkiv.network/typescript-sdk/querying-data/#query-operators and
https://docs.arkiv.network/json-rpc/querying-data/#query-syntax; checked 2026-09-10.
