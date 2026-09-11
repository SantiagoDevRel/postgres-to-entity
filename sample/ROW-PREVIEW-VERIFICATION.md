# Actual row destinations — 2026-09-11

The final testnet review now separates the source-row editor from the resulting Attributes
and Payload. renderRowPreview receives prepareRow.display; it does not remap fields or use
illustrative values. Every refresh clears the preview before attempting validation, so invalid
JSON, model changes and pending confirmation cannot leave a misleading current preview.
Creation flags have a decorative, aria-hidden flag emoji; control labels stay unchanged.

Verified locally with TypeScript/Vite build, 14 row/filter tests, and the full wallet fixture
(7 simulated creations with SDK calldata and readback). Dedicated browser tests cover edited
values, buyer_email moving payload → attribute → excluded, invalid JSON clearing stale content,
consent reset, and displayed output matching the encoder. No real wallet transaction or GLM spent.

Twenty viewport/theme probes cover 320/390/519/520/521/682/683/684/768/1440, with screenshots
inspected at 390/768/1440 in both themes and CSS zoom 200%. Existing font roles and entity layout
are reused without a new dependency or stylesheet. Evidence: Downloads/postgres-row-preview.

Adversarial frontend/UX/logic review: source editor remains the sole editable value source;
display reads the actual encoder output; excluded/null attributes do not leak; untrusted strings
use textContent; no new submission path; existing signing, consent and receipt guards retained.
