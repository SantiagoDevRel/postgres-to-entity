import assert from 'node:assert/strict';
import { createPublicClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { bytes, i32 } from '@arkiv-network/sdk/schema';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { generatedDemo, demoId } from '../sample/shared/demo.mjs';
import { policyWallet } from './rabdi-wallet-policy.mjs';

async function main() {
  if (!process.env.ARKIV_ACCESS_KEY_A || !process.env.TEST_P2E_PRIVATE_KEY || !process.env.TEST_P2E_ADDRESS) throw new Error('Missing injected lane configuration.');
  const account = privateKeyToAccount(process.env.TEST_P2E_PRIVATE_KEY);
  assert.equal(account.address.toLowerCase(), process.env.TEST_P2E_ADDRESS.toLowerCase());
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A });
  const transport = http(undefined, { timeout: 20000, retryCount: 0 });
  const reader = createPublicClient({ chain, transport });
  const { wallet, state } = policyWallet({ chain, transport, account });
  assert.equal(await reader.getChainId(), 7794095);
  const { schema } = generatedDemo();
  let failure;
  try {
    await wallet.createEntity(schema, { id: demoId, score: i32(31), title: 'Lifetime boundary', body: bytes(new Uint8Array()) },
      { expiration: ExpirationTime.atBlock(2n ** 64n - 1n) });
  } catch (error) { failure = error; }
  assert.equal(state.sendStarted, false, 'Failed estimation must prevent signing');
  assert.equal(state.txHash, null);
  let estimationError = false;
  for (let cause = failure, depth = 0; cause && depth < 12; cause = cause.cause, depth++) {
    if (String(cause.message ?? '').includes('gas estimation failed at latest')) estimationError = true;
  }
  assert.ok(estimationError, 'Over-limit expiration must fail unsigned estimation');
  console.log(JSON.stringify({ network: 'Rabdi', chainId: 7794095, unsignedEstimationRejected: true, writes: 0,
    maximumLifetimeBlocks: 7884000, automaticRetry: false, queriesKeyA: 0, queriesKeyB: 0 }, null, 2));
}
main().catch(() => { console.error('Lifetime boundary verification failed. No automatic retry. Inspect the lane receipt before continuing.'); process.exitCode = 1; });
