# Release verification

Run `bash scripts/verify-dgx.sh` through the DGX storage client from the repository root.
It uses the existing Node 22 Alpine image with `--pull=never`; it never installs an image.

The release driver runs tests, typecheck, vocabulary/source lint, build, pack, sample
installation/build/tests, and an independent clean archive consumer with complete
fixture parity and CLI checks. Generated evidence belongs in the ignored
`release-evidence/` folder and is retained through the DGX artifact manifest.

`check-node22.mjs` additionally checks runtime, types, library build, sample tests
and a second archive consumer using Node 22 on ARM64. The frontend build also runs
on the DGX host; no local dependency installation is needed.

`seed-rabdi.mjs` reads the generated schema from the installed archive. Inject
ARKIV_ACCESS_KEY_A and only the funded TEST_P2E wallet through the secrets runner.
It checks the source identity and owner before creating and verifies receipt/read/query.
Repeat runs return the existing verified entity without writing.
Use `node --experimental-strip-types scripts/seed-rabdi.mjs` (and the same flag for
the live verification scripts) so the shared TypeScript policy also runs on Node 22.12.

`verify-large-rabdi.mjs` writes a generated-schema entity containing 70,000 nonzero
binary bytes through the same unsigned-request policy used by the sample. It requires
TEST_P2E and Key A, checks successful receipt, exact byte readback and indexed query,
and repeats without writing. `rabdi-wallet-policy.mjs` adapts that policy to the local
lane signer without printing credentials. Both use zero automatic retries.

`verify-rabdi-lifetime.mjs` now checks that an over-limit expiration fails unsigned
estimation before any signing. The earlier live reverted-receipt boundary proof is
preserved in the release verification evidence; this command never bypasses estimation.

Browser acceptance is exported by `sample/scripts/verify-rabdi.mjs`. Supply an isolated
Playwright context in an owned background Chrome window and the existing Viem module.
Only preview-scoped authentication cookies may be copied into that temporary context;
never print or persist them. The immutable fixture provider is checked before any
connection attempt. The backend seed/chain/fee reads remain real; wallet transactions
are simulated and reported separately from the live seed proof.
