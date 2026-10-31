import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd(), registry = process.argv.includes('--registry');
const checks = [];
mkdirSync('release-evidence', { recursive: true });
function run(name, args, cwd = root) {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(root, 'release-evidence', name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''));
  console.log(name + ': ' + (result.status === 0 ? 'PASS' : 'FAIL'));
  if (result.status !== 0) console.log(((result.stdout ?? '') + (result.stderr ?? '')).slice(-12000));
  checks.push({ name, code: result.status });
  writeFileSync(join(root, 'release-evidence/verification.json'), JSON.stringify({ arch: process.arch, node: process.version, checks }, null, 2));
  assert.equal(result.status, 0, name + ' failed; stop at the first failing check.');
  return true;
}
run('unit', ['test']);
run('typecheck', ['run', 'typecheck']);
run('lint', ['run', 'lint']);
const built = run('build', ['run', 'build']);
if (built && (registry || run('pack', ['pack', '--pack-destination', 'sample/vendor']))) {
  const archive = registry ? 'postgres-to-entity@1.0.0' : resolve('sample/vendor/postgres-to-entity-1.0.0.tgz');
  // A rebuilt local archive can keep its filename/version; explicitly resolve it
  // so npm refreshes integrity instead of reusing the old file dependency lock.
  if (!registry) run('sample-lock', ['install', './vendor/postgres-to-entity-1.0.0.tgz', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], join(root, 'sample'));
  if (run('sample-install', ['ci', '--no-audit', '--no-fund'], join(root, 'sample'))) {
    run('sample-build', ['run', 'build'], join(root, 'sample'));
    const sampleTest = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'scripts/row.test.ts', 'scripts/query-guide.test.ts', 'scripts/write-policy.test.ts', 'scripts/write-operation.test.ts'], { cwd: join(root, 'sample'), encoding: 'utf8' });
    writeFileSync('release-evidence/sample-tests.log', (sampleTest.stdout ?? '') + (sampleTest.stderr ?? ''));
    checks.push({ name: 'sample-tests', code: sampleTest.status });
    console.log('sample-tests: ' + (sampleTest.status === 0 ? 'PASS' : 'FAIL'));
    assert.equal(sampleTest.status, 0, 'sample-tests failed; stop.');
    if (sampleTest.status !== 0) console.log(((sampleTest.stdout ?? '') + (sampleTest.stderr ?? '')).slice(-12000));
  }
  const consumer = join(process.env.TMPDIR, 'p2e-consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  if (run('consumer-install', ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive], consumer)) {
    assert.ok(readFileSync(join(consumer, 'node_modules/postgres-to-entity/README.md'), 'utf8').includes('npm install postgres-to-entity@1.0.0 @arkiv-network/sdk@1.0.0 viem'), 'Packed README must install the registry release');
    const packed = await import(pathToFileURL(join(consumer, 'node_modules/postgres-to-entity/dist/postgres.js')));
    const source = await import(pathToFileURL(join(root, 'dist/postgres.js')));
    const fixtures = JSON.parse(readFileSync('src/model-fixtures.json', 'utf8'));
    const full = fixtures.fixtures.map(fixture => {
      const actual = packed.generateModel(fixture.input);
      assert.deepEqual(actual, source.generateModel(fixture.input), 'Complete archive parity: ' + fixture.id);
      assert.equal(actual.format, 'arkiv-entity-model/3');
      assert.equal(actual.sdkVersion, '1.0.0');
      for (const entity of actual.entities) packed.toSdkSchema(entity);
      return { id: fixture.id, input: fixture.input, model: actual, markdown: packed.modelMarkdown(actual) };
    });
    writeFileSync('release-evidence/full-model-fixtures.json', JSON.stringify({ package: 'postgres-to-entity', version: '1.0.0', fixtures: full }, null, 2));
    const request = resolve('examples/model-request.json');
    const output = join(consumer, 'model.json');
    const cli = join(consumer, 'node_modules/postgres-to-entity/bin/arkiv-packer.mjs');
    const first = spawnSync(process.execPath, [cli, request, '--out', output], { encoding: 'utf8' });
    assert.equal(first.status, 2, 'Advanced membership example keeps its consistency decision');
    const second = spawnSync(process.execPath, [cli, request, '--out', output], { encoding: 'utf8' });
    assert.equal(second.status, 1, 'CLI refuses overwrite');
    const invalid = spawnSync(process.execPath, [cli, '-'], { input: JSON.stringify({ schema: {} }), encoding: 'utf8' });
    assert.equal(invalid.status, 3, 'Public CLI rejects alternate inputs');
    checks.push({ name: 'consumer-full-parity-and-cli', code: 0 });
  }
  if (registry) {
    run('registry-archive', ['pack', 'postgres-to-entity@1.0.0', '--ignore-scripts', '--pack-destination', 'release-evidence']);
    const digest = createHash('sha256').update(readFileSync('release-evidence/postgres-to-entity-1.0.0.tgz')).digest('hex');
    assert.equal(digest, 'a2ad2995a15cd040e4346adfbdcd34c8aff0095fb9721ce17147b55c7496d0e2');
    writeFileSync('release-evidence/archive-sha256.txt', digest + '\n');
  } else writeFileSync('release-evidence/archive-sha256.txt', createHash('sha256').update(readFileSync(archive)).digest('hex') + '\n');
}
writeFileSync('release-evidence/verification.json', JSON.stringify({ arch: process.arch, node: process.version, checks }, null, 2));
if (checks.some(check => check.code !== 0)) process.exitCode = 1;
