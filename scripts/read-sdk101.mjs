import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import { generateModel, toSdkSchema } from '../dist/postgres.js';
import { demoRequest, demoId } from '../sample/shared/demo.mjs';

try {
  const owner = process.env.TEST_P2E_ADDRESS;
  assert.match(owner, /^0x[\da-f]{40}$/i);
  const client = createPublicClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A }), transport: http(undefined, { retryCount: 0 }) });
  assert.equal(await client.getChainId(), 7794095);
  const model = generateModel(demoRequest);
  assert.equal(model.format, 'arkiv-entity-model/3'); assert.equal(model.sdkVersion, [1, 0, 0].join('.'));
  const schema = toSdkSchema(model.entities[0]);
  const before = await client.getTransactionCount({ address: owner, blockTag: 'latest' });
  const result = await client.select({ $key: true, $owner: true, $attributes: true }).ownedBy(owner).where(eq('arkiv.schema', schema.name)).limit(1).fetch();
  assert(result.entities.every(e => e.$owner.toLowerCase() === owner.toLowerCase()));
  for (const entity of result.entities) assert.equal(entity.$attributes.id?.value, demoId);
  assert.equal(await client.getTransactionCount({ address: owner, blockTag: 'latest' }), before);
  const evidence = { status: 'PASS', sdk: '1.0.1', format: model.format, sdkBaseline: model.sdkVersion, owner, schema: schema.name, entities: result.entities.length, writes: 0, queriesKeyA: 1, nonceUnchanged: true };
  fs.mkdirSync('release-evidence', { recursive: true });
  fs.writeFileSync('release-evidence/live-sdk101.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) { console.error(JSON.stringify({ status: 'FAILED', errorKind: error.name, scope: 'read-only SDK check' })); process.exitCode = 1; }
