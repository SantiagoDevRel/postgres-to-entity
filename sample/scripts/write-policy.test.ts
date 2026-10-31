import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendWithPolicy, WritePolicyError } from '../src/write-policy.ts';
// The release driver installs the actual archive before these consumer tests.
// @ts-expect-error JavaScript fixture helper is also used by the Vercel read endpoint.
import { generatedDemo, demoRequest } from '../shared/demo.mjs';

test('live large-row proof makes its one-day expiration an explicit generated-model decision', () => {
  const original = generatedDemo();
  const request = { ...demoRequest, policies: [{ ...demoRequest.policies[0], expiration: 'Bounded one-day proof', expirationBlocks: 43200 }] };
  const bounded = generatedDemo(request);
  assert.equal(bounded.model.status, 'modelled');
  assert.equal(bounded.entity.expirationPolicy.blocks, 43200);
  assert.equal(original.entity.expirationPolicy.blocks, 7883970);
  assert.deepEqual(bounded.entity.schema, original.entity.schema);
  assert.equal(demoRequest.policies[0].expirationBlocks, 7883970);
});

const hash = '0x' + 'ab'.repeat(32);
function fixture({ estimate = 3500000n, limit = 30000000n, fail = '', nonceChanged = false } = {}) {
  const calls: Array<{ method: string; params?: readonly unknown[] }> = []; let nonceReads = 0;
  return { calls, async request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> {
    calls.push(args);
    if (args.method === fail) throw Error('transport unavailable');
    switch (args.method) {
      case 'eth_getTransactionCount': assert.equal(args.params?.[1], 'latest'); return nonceChanged && nonceReads++ ? '0x8' : '0x7';
      case 'eth_gasPrice': return '0x3b9aca01';
      case 'eth_estimateGas': assert.equal(args.params?.[1], 'latest'); return '0x' + estimate.toString(16);
      case 'eth_getBlockByNumber': assert.deepEqual(args.params, ['latest', false]); return { gasLimit: '0x' + limit.toString(16) };
      case 'eth_sendTransaction': return hash;
      default: throw Error('unexpected request');
    }
  } };
}
test('70 KB request is estimated exactly and sent once with twice the estimate and current fees/nonce', async () => {
  const provider = fixture(), data = '0x' + '5a'.repeat(70000);
  const tx = { from: '0x' + '11'.repeat(20), to: '0x' + '44'.repeat(20), data, value: '0x0', gas: '0xf4240' };
  let reviewed = false, submitted = '';
  await sendWithPolicy(provider, tx, async () => { reviewed = true; }, value => { submitted = value; });
  const estimated = provider.calls.find(x => x.method === 'eth_estimateGas')!.params![0] as Record<string, unknown>;
  assert.equal(estimated.data, data); assert.equal(estimated.value, tx.value); assert.equal(estimated.gas, undefined);
  const sends = provider.calls.filter(x => x.method === 'eth_sendTransaction'); assert.equal(sends.length, 1);
  const sent = sends[0]!.params![0] as Record<string, unknown>;
  assert.deepEqual(sent, { ...estimated, gas: '0x6acfc0' });
  assert.equal(sent.nonce, '0x7'); assert.equal(sent.gasPrice, '0x3b9aca01');
  assert.ok(reviewed); assert.equal(submitted, hash); assert.equal(tx.gas, '0xf4240');
});
test('small writes retain the million-gas floor and exact half-head budget is accepted', async () => {
  for (const [estimate, limit, gas] of [[100000n, 30000000n, 1000000n], [7500000n, 30000000n, 15000000n]]) {
    const provider = fixture({ estimate, limit });
    await sendWithPolicy(provider, { from: 'owner', data: '0x' }, async () => {}, () => {});
    const sent = provider.calls.find(x => x.method === 'eth_sendTransaction')!.params![0] as { gas: string };
    assert.equal(BigInt(sent.gas), gas);
  }
});
test('estimate failure, excessive head budget, stale nonce or changed consent cannot send', async () => {
  for (const options of [{ fail: 'eth_estimateGas' }, { estimate: 7500001n }, { estimate: 0n }, { nonceChanged: true }, { fail: 'eth_getBlockByNumber' }]) {
    const provider = fixture(options);
    await assert.rejects(sendWithPolicy(provider, { from: 'owner', data: '0x' }, async () => {}, () => {}), error => {
      if (options.fail !== 'eth_getBlockByNumber') assert.ok(error instanceof WritePolicyError);
      if (options.estimate === 7500001n) assert.match((error as Error).message, /50%.+Split/);
      return true;
    });
    assert.equal(provider.calls.filter(x => x.method === 'eth_sendTransaction').length, 0);
  }
  const provider = fixture();
  await assert.rejects(sendWithPolicy(provider, { from: 'owner' }, async () => { throw Error('consent changed'); }, () => {}), /consent/);
  assert.equal(provider.calls.filter(x => x.method === 'eth_sendTransaction').length, 0);
});
test('uncertain send errors never retry or invent a submitted hash', async () => {
  const provider = fixture({ fail: 'eth_sendTransaction' }); let submitted = false;
  await assert.rejects(sendWithPolicy(provider, { from: 'owner' }, async () => {}, () => { submitted = true; }));
  assert.equal(provider.calls.filter(x => x.method === 'eth_sendTransaction').length, 1);
  assert.equal(submitted, false);
});

test('gas-exhaustion retry floor is re-estimated at latest and still obeys the head cap', async () => {
  const provider = fixture({ estimate: 200000n });
  await sendWithPolicy(provider, { from: 'owner' }, async () => {}, () => {}, undefined, 2000000n);
  const tx = provider.calls.find(x => x.method === 'eth_sendTransaction')!.params![0] as { gas: string };
  assert.equal(BigInt(tx.gas), 2000000n);
  const capped = fixture({ estimate: 200000n, limit: 3000000n });
  await assert.rejects(sendWithPolicy(capped, { from: 'owner' }, async () => {}, () => {}, undefined, 2000000n), /50%/);
  assert.equal(capped.calls.filter(x => x.method === 'eth_sendTransaction').length, 0);
});
