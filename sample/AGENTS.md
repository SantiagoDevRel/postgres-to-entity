Edit instructions only in AGENTS.md; CLAUDE.md only imports this file.

# Sample rules

Read ../AGENTS.md and README.md. Use the exact 1.0.0 tarball, SDK 1.0.0 and Rabdi 7794095.
Preserve the existing three-step UI, Arkiv tokens, responsive layout and text rendering.
Only explicit field choices drive indexing. Store other source values in named columns;
arrays remain stored here. bytes columns cannot be indexed. Keep explicit UTF-8 bounds.

Owner options: Connected wallet permits deployment; Another wallet is example-only.
Require bounded future datetime-local expiration (max 7,883,970 nominal blocks).
Only connect on click. Use the user's wallet-configured RPC; never request a private key.
Server access keys belong only in ARKIV_ACCESS_KEY, not the client or NEXT_PUBLIC variables.

Keep schemas/rows local and in memory. Illustrations never enter model exports or writes.
Only prepareRow's encoded values and display may feed transaction preview/creation.
Reject unknown/excluded fields, unsafe numbers, invalid source types and unsupported
encodings before signing. Preserve null/empty distinctions; JSON uses {value:...} and
arrays use {values,lowerBounds}. Source PK/FK values remain separate from system keys.

Invalidate consent on model/row/account/network/flags changes and recheck before send.
Explicit gas, gasPrice, nonce/latest and successful receipt are mandatory. Obtain an
unsigned estimate of the exact SDK request at latest; stop if it fails. Use gas equal
to max(1000000n,2*estimate), capped at half the latest block gas limit; refuse larger rows.
Estimate through the wallet RPC so private row data never reaches the server proxy.
Keep one persistent operation record keyed by signer and source identity across rerenders
and clicks, before any network call. SDK success sets submitted(hash) before lookup
and never permits another send, even when later receipt reads disagree or return null.
Only an SDK-confirmed reverted receipt with gasUsed == sent gas permits one retry:
re-estimate at latest, at least double prior gas, and retain the half-head cap.
Any other revert is terminal. Max two attempts ever. Uncertain sends stay locked.
Retain an available transaction hash, block resends and permit read-only reconciliation.
Compare typed readback and creation flags with the submitted values. Source constraints
require explicit review, not a claim of automatic SQL constraint enforcement.

Read-only server endpoints are bounded, fail closed on missing access key, and do not
forward credential-bearing upstream errors. The fixed public example is owner-filtered.
Idempotent seed: ../scripts/seed-rabdi.mjs; never mutate or delete other entities.

Keep keyboard focus, mounted form state, help cleanup, light/dark and responsive behavior.
Check 320/390/768/1440 widths, 200% zoom and boundaries touched by the change.
Tests consume the archive. Browser wallet fixtures do not prove a real browser-wallet write;
report the separate live integration honestly. No production promotion before review approval.
