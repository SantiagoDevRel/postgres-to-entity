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

`verify-rabdi-lifetime.mjs` is a deliberate negative integration probe: it sends one
over-limit expiration, requires an authoritative reverted receipt and the specific
ExpiryBeyondMaxLifetime error, and never retries. Run it only as an authorized test.

Browser acceptance is exported by `sample/scripts/verify-rabdi.mjs`. Supply an isolated
Playwright context in an owned background Chrome window and the existing Viem module.
Only preview-scoped authentication cookies may be copied into that temporary context;
never print or persist them. The immutable fixture provider is checked before any
connection attempt. The backend seed/chain/fee reads remain real; wallet transactions
are simulated and reported separately from the live seed proof.
