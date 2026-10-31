import assert from 'node:assert/strict';
import { createPublicClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { bytes, i32 } from '@arkiv-network/sdk/schema';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { generatedDemo, demoRequest } from '../sample/shared/demo.mjs';
import { policyWallet } from './rabdi-wallet-policy.mjs';

let state, queries = 0;
async function main() {
  if (!process.env.ARKIV_ACCESS_KEY_A || !process.env.TEST_P2E_PRIVATE_KEY || !process.env.TEST_P2E_ADDRESS) throw Error('Inject Key A and TEST_P2E through the secrets runner.');
  const account = privateKeyToAccount(process.env.TEST_P2E_PRIVATE_KEY);
  assert.equal(account.address.toLowerCase(), process.env.TEST_P2E_ADDRESS.toLowerCase());
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A }), transport = http(undefined, { timeout: 30000, retryCount: 0 });
  const client = createPublicClient({ chain, transport });
  const configured = policyWallet({ account, chain, transport }); state = configured.state;
  const request = { ...demoRequest, policies: [{ ...demoRequest.policies[0], expiration: 'Bounded one-day proof; owner-authorized Lifetime Extension only', expirationBlocks: 43200 }] };
  const { schema, model, entity } = generatedDemo(request), id = '00000000-0000-4000-8000-000000000002';
  const value = new Uint8Array(70000).fill(0x5a);
  queries++;
  const prior = await client.select({ $key: true }).from(schema).where(eq('id', id)).ownedBy(account.address).limit(2).fetch();
  assert.ok(prior.entities.length <= 1, 'Duplicate proof identities; inspect without deletion');
  let result = prior.entities[0] && { entityKey: prior.entities[0].$key }, receipt;
  if (!result) {
    result = await configured.wallet.createEntity(schema, { id, score: i32(70), title: '70 KB exact request', body: bytes(value) },
      { expiration: ExpirationTime.fromBlocks(entity.expirationPolicy.blocks) });
    receipt = await client.getTransactionReceipt({ hash: result.txHash });
    assert.equal(receipt.status, 'success');
    assert.equal(state.quote.gas, state.quote.estimate * 2n);
    assert.ok(state.quote.gas <= state.quote.headGasLimit / 2n);
  }
  const read = await client.getEntity(result.entityKey, schema);
  assert.equal(read.body.value, '0x' + Buffer.from(value).toString('hex'));
  assert.equal(read.id.value, id); assert.equal(read.score.value, 70);
  queries++;
  const queried = await client.select({ $key: true }).from(schema).where(eq('score', i32(70))).ownedBy(account.address).limit(2).fetch();
  assert.ok(queried.entities.some(e => e.$key === result.entityKey));
  console.log(JSON.stringify({ network: 'Rabdi', chainId: chain.id, format: model.format, sdkVersion: model.sdkVersion,
    bytes: value.length, lifetimeBlocks: entity.expirationPolicy.blocks, action: receipt ? 'created' : 'already-created', writes: receipt ? 1 : 0,
    entityKey: result.entityKey, txHash: result.txHash ?? null, receiptStatus: receipt?.status ?? null,
    gasUsed: receipt?.gasUsed ?? null, quote: state.quote, queriesKeyA: queries, automaticRetries: 0,
    exactUnsignedRequestEstimated: true, estimateBlockTag: 'latest', funderSigned: false }, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}
main().catch(() => {
  console.error(JSON.stringify({ error: 'Large-row verification stopped. Inspect the lane transaction; no retry was attempted.',
    txHash: state?.txHash ?? null, sendStarted: state?.sendStarted ?? false, queriesKeyA: queries }));
  process.exitCode = 1;
});
