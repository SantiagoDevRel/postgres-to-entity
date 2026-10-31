import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.equal(process.versions.node.split('.')[0], '22');
const checks = [], root = process.cwd();
mkdirSync('release-evidence', { recursive: true });
function check(name, command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(root, 'release-evidence', 'node22-' + name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''));
  checks.push({ name, code: result.status });
  assert.equal(result.status, 0, name + ' failed; inspect the preserved log.');
}
check('unit', 'npm', ['test']);
check('typecheck', 'npm', ['run', 'typecheck']);
check('lint', 'npm', ['run', 'lint']);
check('build', 'npm', ['run', 'build']);
check('sample-typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], join(root, 'sample'));
check('sample-tests', process.execPath, ['--experimental-strip-types', '--test', 'scripts/row.test.ts', 'scripts/query-guide.test.ts', 'scripts/write-policy.test.ts', 'scripts/write-operation.test.ts'], join(root, 'sample'));
const consumer = mkdtempSync(join(tmpdir(), 'p2e-node22-'));
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
check('consumer-install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve('sample/vendor/postgres-to-entity-1.0.0.tgz')], consumer);
const packed = await import(pathToFileURL(join(consumer, 'node_modules/postgres-to-entity/dist/postgres.js')));
const fixtures = JSON.parse(readFileSync('release-evidence/full-model-fixtures.json', 'utf8'));
for (const fixture of fixtures.fixtures) assert.deepEqual(packed.generateModel(fixture.input), fixture.model, fixture.id + ' full parity on Node 22');
const cli = join(consumer, 'node_modules/postgres-to-entity/bin/arkiv-packer.mjs');
assert.equal(spawnSync(process.execPath, [cli, resolve('examples/model-request.json')], { encoding: 'utf8' }).status, 2);
checks.push({ name: 'consumer-full-parity-and-cli', code: 0 });
writeFileSync('release-evidence/node22.json', JSON.stringify({ arch: process.arch, node: process.version, checks }, null, 2));
console.log('Node 22 on ' + process.arch + ': all runtime, type and packed consumer checks passed.');
