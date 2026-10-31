import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { generateModel, modelMarkdown, MAX_LIFETIME_BLOCKS, toSdkSchema } from './postgres.ts';

const fixtures = JSON.parse(readFileSync(new URL('./model-fixtures.json', import.meta.url), 'utf8'));
test('lane M complete JSON and Markdown outputs remain frozen to the reviewed candidate', () => {
  const full = fixtures.fixtures.map((fixture: { id: string; input: unknown }) => {
    const model = generateModel(fixture.input);
    return { id: fixture.id, input: fixture.input, model, markdown: modelMarkdown(model) };
  });
  const snapshot = JSON.stringify({ package: 'postgres-to-entity', version: '1.0.0', fixtures: full }, null, 2);
  // d659433 handoff: changing this contract requires lane M's explicit agreement.
  assert.equal(createHash('sha256').update(snapshot).digest('hex'), '236b9f8a374c1f20d143ad5dc094a4715d492adec7a4ad2bddcb625d74de43fa');
});
for (const fixture of fixtures.fixtures) test('lane M parity: ' + fixture.id, () => {
  const model = generateModel(fixture.input);
  assert.equal(model.format, fixtures.format);
  assert.equal(model.sdkVersion, fixtures.sdkVersion);
  for (const entity of model.entities) {
    assert.equal(Object.hasOwn(entity, 'payload'), false);
    assert.equal(Object.hasOwn(entity, 'payloadMetadata'), false);
    const schema = toSdkSchema(entity);
    for (const column of entity.schema.columns) {
      assert.equal(typeof column.indexed, 'boolean');
      assert.equal(schema.columns[column.name]?.isIndexed, column.indexed);
      assert.equal(schema.columns[column.name]?.isOptional, column.nullable);
      if (column.type === 'bytes') assert.equal(column.indexed, false);
    }
  }
  for (const projection of fixture.requiredColumnProjections ?? []) {
    const actual = model.entities.flatMap(e => e.schema.columns).find(c =>
      c.source?.table === projection.source.table && c.source.column === projection.source.column);
    assert.ok(actual, 'preserved source ' + projection.source.column);
    assert.equal(actual.type, projection.type);
    assert.equal(actual.indexed, projection.indexed);
  }
  if (fixture.id === 'typed-filter-and-stored-bytes') {
    const entity = model.entities[0]!;
    assert.deepEqual(entity.identity, ['id']);
    assert.equal(entity.owner, fixture.input.policies[0].owner);
    assert.equal(entity.expiration, fixture.input.policies[0].expiration);
    assert.equal(entity.schema.columns.find(c => c.source?.column === 'body')?.nullEncoding, 'omit-column');
    assert.match(entity.schema.columns.find(c => c.source?.column === 'title')!.encoding, /UTF-8/);
    // Descriptive policy text is preserved but does not silently authorize an arbitrary duration.
    assert.ok(model.decisions.some(d => d.code === 'expiration-bounds'));
  }
  if (fixture.id === 'unsupported-byte-filter') {
    assert.equal(model.status, 'blocked');
    assert.ok(model.blockers.some(b => b.code === 'bytes-not-filterable'));
  }
  if (fixture.id === 'system-field-only-reads') {
    assert.deepEqual(model.entities[0]!.schema.columns.map(c => c.indexed), [false, false]);
    assert.equal(model.entities[0]!.owner, null);
    assert.ok(model.decisions.some(d => d.code === 'lifecycle'));
  }
  assert.doesNotMatch(modelMarkdown(model), /Tiramisu|7738577|SDK 0\.8|payload/);
});

test('bounded explicit expiration and immutable SDK limits', () => {
  const input = { sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY);', filters: [], privacyReviewed: true };
  for (const expirationBlocks of [0, -1, 1.5, 7_884_000, 7_884_001, Number.MAX_SAFE_INTEGER]) {
    assert.equal(generateModel({ ...input, policies: [{ table: 't', owner: 'Connected wallet', expiration: 'Bounded', expirationBlocks }] }).status, 'blocked');
  }
  const model = generateModel({ ...input, policies: [{ table: 't', owner: 'Connected wallet', expiration: 'Maximum supported duration; owner-authorized extension', expirationBlocks: MAX_LIFETIME_BLOCKS }] });
  assert.equal(model.status, 'modelled');
  assert.equal(model.entities[0]!.expirationPolicy.blocks, 7_883_970);
  for (const expiration of ['permanent', 'no expiration', 'forever']) {
    assert.equal(generateModel({ ...input, policies: [{ table: 't', owner: 'Connected wallet', expiration, expirationBlocks: 1 }] }).status, 'blocked');
  }
});

test('all stored columns count toward the actual SDK schema budget', () => {
  for (const count of [31, 32]) {
    const model = generateModel({ sql: `CREATE TABLE t (${Array.from({ length: count }, (_, i) => `v${i} INTEGER`).join(',')});`, filters: [] });
    assert.equal(model.blockers.some(b => b.code === 'column-budget'), count === 32);
    assert.equal(model.entities[0]!.schema.columns.length, count);
    if (count === 31) assert.doesNotThrow(() => toSdkSchema(model.entities[0]!));
    else assert.throws(() => toSdkSchema(model.entities[0]!));
  }
});

test('SDK reserved column and schema-tag names are normalized without value loss', () => {
  const model = generateModel({ sql: 'CREATE TABLE t ("arkiv.schema" INTEGER, "between" INTEGER, "asc" INTEGER, "desc" INTEGER, "order" INTEGER, "by" INTEGER);', filters: [] });
  assert.equal(model.entities[0]!.schema.columns.length, 6);
  assert.doesNotThrow(() => toSdkSchema(model.entities[0]!));
});

test('serial source types retain their implicit non-null constraint without inventing identity', () => {
  const model = generateModel({ sql: 'CREATE TABLE t (small SMALLSERIAL, medium SERIAL, large BIGSERIAL);', filters: [] });
  assert.deepEqual(model.entities[0]!.identity, []);
  assert.deepEqual(model.entities[0]!.schema.columns.map(c => [c.sourceType, c.nullable, c.nullEncoding]), [
    ['smallserial', false, 'forbidden'], ['serial', false, 'forbidden'], ['bigserial', false, 'forbidden'],
  ]);
});

test('relationship schema names obey the 128 UTF-8 byte boundary', () => {
  for (const size of [128, 129]) {
    const model = generateModel({
      sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY, tags INTEGER[]);',
      project: 'é'.repeat(60) + 'a'.repeat(size - 127), filters: [{ table: 't', column: 'tags', operator: 'contains' }],
      privacyReviewed: true, policies: [{ table: 't', owner: 'Connected wallet', expiration: 'Bounded', expirationBlocks: 100 }],
    });
    const relation = model.entities.find(e => e.kind === 't_tags')!;
    assert.equal(Buffer.byteLength(relation.schema.name), size);
    assert.equal(model.blockers.some(b => b.code === 'schema-name-budget'), size > 128);
    assert.equal(model.status === 'blocked', size > 128);
    if (size === 128) assert.doesNotThrow(() => toSdkSchema(relation));
  }
});

test('projects cannot use the reserved triple-slash namespace', () => {
  const model = generateModel({ sql: 'CREATE TABLE t (id INTEGER PRIMARY KEY);', project: '///reserved', filters: [], privacyReviewed: true,
    policies: [{ table: 't', owner: 'Connected wallet', expiration: 'Bounded', expirationBlocks: 100 }] });
  assert.equal(model.status, 'blocked');
  assert.match(model.blockers.map(b => b.message).join(' '), /reserved.*\/\/\//i);
});
