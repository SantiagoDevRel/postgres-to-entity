# AGENTS.md — POSTGRES-TO-ENTITY sample

Read ../AGENTS.md and README.md. This sample is the explicit wallet-enabled expansion
requested on 2026-09-10; the npm model engine remains offline.

- Consume the exact local npm tarball; verify package-lock integrity after repacking.
- Accept only PostgreSQL CREATE TABLE input. JSON appears only as model output and the
  optional final source-row editor. Four example choices must all contain PostgreSQL DDL.
- Deterministic field destinations; no natural-language inference. Compatible scalar
  attributes must not be duplicated in payload. Arrays stay in payload in this UI.
- Owner has exactly two demo choices. Only Connected wallet permits deployment. Another
  wallet is example-only. Never add recipient transfers or private-key fields silently.
- Expiration uses datetime-local, validates future date, preserves the local timezone
  when converting to ISO, and explains approximate calendar→block conversion.
- Connect on click; network Tiramisu 7738577 only; fail closed on wallet/RPC mismatch.
  Public RPC requires no browser access key. Never read personal wallet secrets.
- Rows remain local until explicit review and wallet confirmation. Excluded or unknown
  fields, invalid types, lossy numeric values and unsupported encodings must fail locally.
  Model/row/account/chain changes invalidate consent; recheck before eth_sendTransaction.
- One final checkbox reviews both public fields and actual row values for one write. The
  exported design retains its privacy decision; do not mark it globally approved. Destination
  changes refresh the mapping automatically and preserve local row values by source field.
- Text attributes have a visible explicit 128 UTF-8 byte limit, validated before signing.
  Moving a field to payload removes that field's attribute limit; never truncate or hash it.
- Available filters describe the installed converter's mapped Arkiv types. No exclusive
  operator selector. Show compact filter names only; NOT's missing-attribute note lives in
  the separate collapsed guide. Do not offer ne/exists/hasType.
- Creation flags use true/false controls per entity type, default false. Changes invalidate
  confirmation; lock during signing and snapshot for send/readback. Markdown handoff includes
  the settings; the offline model JSON contract remains unchanged. Flags are immutable on-chain.
- SQL constraints are shown verbatim as text. For the single-row demo, require explicit
  acknowledgement that the row was checked; do not claim to execute DEFAULT/CHECK/UNIQUE.
  This acknowledgement is not a permanent change to the engine's model decisions.
- A submitted transaction is not necessarily confirmed. Retain its hash on uncertain
  outcomes, block resubmission and offer read-only confirmation checking. Never report
  a failed read as a failed creation. Compare SDK readback with submitted values.
- Browser tests use an isolated fixture provider and intercepted RPC, never the user's
  wallet/session. Real testnet verification needs a funded test wallet and human CAPTCHA
  if requested by the faucet. Do not bypass it or claim a simulation was a live write.
- Render source strings with textContent. Do not persist schemas, rows or credentials.
- Model downloads/clipboard must exclude illustrative and edited row values.
- Keep canonical Arkiv tokens and role typography; responsive checks at 320/390/768/1440,
  media 519/520/521 and actual container boundary 682/683/684, themes and 200% zoom.
  Inspect screenshots plus computed fonts, overflow, alignment and long content.
- Guided steps show one mounted panel at a time. Use journey.reveal for error targets;
  never scroll/focus a field hidden in another step. Invalid date inputs open their settings.
  Re-reading unchanged SQL must not discard field choices. Changed SQL invalidates forward steps.
- Keep the final handoff and optional testnet flow collapsed, Attributes and Payload in
  separate visual areas, accessible tooltips, and visible separators between sections.
- Public release is separate from a verified local preview. No new skill publication.

Commands: npm ci; npm run build; npm run dev (3083); npm run preview (3083).
Row tests: node --experimental-strip-types --test scripts/row.test.ts.
Browser host supplies Playwright to scripts/verify-browser.mjs; no extra testing dependency.
