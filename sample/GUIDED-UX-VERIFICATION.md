# Guided workshop UX — 2026-09-11

Three active steps: Schema → Fields → Entity. The form and row editor remain mounted.
Back navigation preserves selected fields, edited row values, flags and policies. Changing
SQL invalidates forward steps; errors reveal the correct step and collapsed controls.

Four example tiles form two balanced rows. Step 2 introduces filterable Attributes and
readable Payload using examples derived from current selections. Step 3 puts both within
one entity frame; metadata, mapping, handoff and optional testnet action disclose details
progressively. Flags remain visible with human-readable labels and actual boolean values.

Consultation: Claude Code recommended three steps, plain-language labels and progressive
details. Lovable produced a separate mock prototype, opened and visually inspected:
https://lovable.dev/projects/0aa1710a-5cd9-440f-8a92-1e4eda92ab01
Only UX ideas were used; the existing parser, SDK and transaction implementation remain.
Lovable mock filter suggestions were not treated as protocol capabilities.
The additional final Claude review timed out without a result; it is not counted as approval.
The final diff received a local adversarial UI/state review and the browser checks below.

Typography reuses existing Arkiv tokens: display 32/24/20 with Brutal Type/Space Grotesk,
body and controls 16 with IBM Plex Mono, field controls/help/code 14. Existing official SVGs
and approved palette retained. No dependency added.

Validation:
- Sample build and 14 row/filter tests.
- Seven isolated SDK transaction simulations, all four creation flag combinations,
  insufficient funds, wallet rejection, account changes and uncertain receipt recovery.
- Navigation suite: 78 combinations (3 steps × 13 widths × 2 themes), no page overflow,
  exactly one panel visible, all three navigation buttons share a row; fonts computed.
- Widths: 320, 390, 519/520/521, 668/669/670, 682/683/684, 768, 1440.
- Screenshots inspected for narrow/medium/wide views; CSS zoom 200% tested for all steps.
- Row/flags preserved through back navigation and rebuild; SQL changes invalidate steps;
  blocker links focus the correct field; expired dates reveal collapsed settings.
- Physical devices and browser-menu zoom were not tested. No real transaction or GLM spent.
- Both browser suites also passed on the public deployment
  `dpl_GPyfksM7V2EzUhGZ1bjDcBXWgZpf` (`index-BlpkXti8.js`). Six sensitive paths returned
  404. Codex coverage check confirmed all four requested items.

Data Explorer observation: the inspected entity card displayed owner, creator, expiration,
payload and attributes but no creation flags. The demo exposes them in step 3 and readback.
