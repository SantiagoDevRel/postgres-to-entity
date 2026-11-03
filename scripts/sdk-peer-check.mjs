import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withIsolatedCheckout } from './isolated-checkout.mjs';

const version = [1, 0, 0].join('.');
withIsolatedCheckout(({ root }) => {
  const run = (command, args, directory = root) => execFileSync(command, args, {
    cwd: directory, stdio: 'inherit', env: { ...process.env, CI: 'true', SDK_TEST_VERSION: version },
  });
  for (const directory of [root, path.join(root, 'sample')]) {
    run('npm', ['install', '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund', '@arkiv-network/sdk@' + version], directory);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'node_modules/@arkiv-network/sdk/package.json'))).version, version);
  }
  run('npm', ['test']);
  run(process.execPath, ['--experimental-strip-types', '--test', 'scripts/write-operation.test.ts', 'scripts/write-policy.test.ts'], path.join(root, 'sample'));
  run(process.execPath, ['scripts/sdk-runtime-check.mjs']);
  console.log(JSON.stringify({ status: 'PASS', peerBaseline: version, sdkSwitchInTemporaryCopy: true }));
}, { prefix: 'p2e-sdk-peer-' });
