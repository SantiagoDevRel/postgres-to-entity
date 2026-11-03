import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAgentHandoff } from '../src/model-handoff.ts';

test('agent and Markdown export boundary explains format compatibility before frozen model text', () => {
  const markdown = '**Format:** arkiv-entity-model/3 | SDK ' + [1, 0, 0].join('.') + '\n{"sdkVersion":"' + [1, 0, 0].join('.') + '"}';
  const flags = { tasks: { isPublic: false } };
  const result = buildAgentHandoff(markdown, flags);
  const boundary = result.slice(0, result.indexOf(markdown));
  assert.match(boundary, /sdkVersion field is format \/3's minimum compatible SDK baseline, not the installed or latest SDK/);
  assert.match(boundary, /Current guidance: SDK \^1\.0\.0, verified with 1\.0\.1/);
  assert.match(boundary, /format \/3's own lifetime policy is at most 7,883,970 blocks, kept for compatibility/i);
  assert.match(boundary, /not a Rabdi requirement.*SDK\/chain maximum of 7,884,000 blocks/);
  assert.ok(result.includes(markdown), 'The authoritative compatibility text is preserved verbatim');
  assert.ok(result.includes(JSON.stringify(flags, null, 2)), 'Creation settings remain separate and complete');
  assert.deepEqual(flags, { tasks: { isPublic: false } });
});
