# Workshop concept previews — 2026-09-11

- Inspected the supplied authenticated Sourcify entity in the browser, including its
  attribute table and JSON payload. The sample mirrors that vertical structure in a small
  excerpt, using existing Arkiv palette, fonts and help lifecycle. No reference data is copied.
- Both concept cards support mouse hover. View entity supports keyboard and touch; Escape,
  blur and outside tap dismiss. Replaced previews dispose their previous hover listeners.
  The first source table supplies a representative query field and payload field; ds/kind
  provide context. Example values never enter exports or transactions.
- Primary Deploy to Tiramisu opens and focuses the row review. Agent handoff follows the
  testnet section, closed by default and reset on a new schema. Wallet guards are unchanged.

Local verification: TypeScript/Vite build, 14 row/filter tests, full wallet regression with
7 simulated SDK creations, guided navigation's 78 viewport/theme/step probes, and 40 new
concept preview probes. Screenshots inspected at 390, 768 and 1440, dark/light, plus CSS zoom
200%; geometry checks also cover 320, 519/520/521 and 682/683/684. Tested hover persistence,
keyboard, touch, dismissal, destination changes and CTA focus. No real transaction or GLM spent.

Adversarial frontend/UX pass: textContent-only source rendering; no new dependencies;
one visible tooltip; bounded viewport geometry; disposal on rebuild; same-table examples;
no destination duplication; collapsed optional handoff; CTA does not imply an automatic write.
Existing wallet suite covers signing rejection, account/network changes, flags and readback.
Evidence lives in Downloads/postgres-mini-entity/{local,production} and the existing journey
and wallet regression evidence folders. Automated checks are exported from
scripts/verify-concepts.mjs, scripts/verify-journey.mjs and scripts/verify-browser.mjs.
