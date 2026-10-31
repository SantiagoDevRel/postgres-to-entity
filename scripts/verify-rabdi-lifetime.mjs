import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { bytes, i32 } from '@arkiv-network/sdk/schema';
import { createPublicClient as createEvmPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { generatedDemo, demoId } from '../sample/shared/demo.mjs';

async function main() {
  if (!process.env.ARKIV_ACCESS_KEY_A || !process.env.TEST_P2E_PRIVATE_KEY || !process.env.TEST_P2E_ADDRESS) throw new Error('Missing injected lane configuration.');
  const account = privateKeyToAccount(process.env.TEST_P2E_PRIVATE_KEY);
  assert.equal(account.address.toLowerCase(), process.env.TEST_P2E_ADDRESS.toLowerCase());
  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A });
  const transport = http(undefined, { timeout: 20000, retryCount: 0 });
  const reader = createPublicClient({ chain, transport }), wallet = createWalletClient({ chain, transport, account });
  assert.equal(await reader.getChainId(), 7794095);
  const { schema } = generatedDemo();
  const fees = createEvmPublicClient({ chain, transport });
  const [nonce, gasPrice] = await Promise.all([reader.getTransactionCount({ address: account.address, blockTag: 'latest' }), fees.getGasPrice()]);
  let failure;
  try {
    await wallet.createEntity(schema, { id: demoId, score: i32(31), title: 'Lifetime boundary', body: bytes(new Uint8Array()) },
      { expiration: ExpirationTime.atBlock(2n ** 64n - 1n) }, { nonce, gas: 1000000n, gasPrice });
  } catch (error) { failure = error; }
  assert.ok(failure?.txHash, 'The rejection must have an authoritative transaction hash. Never retry an uncertain transaction.');
  const receipt = await reader.getTransactionReceipt({ hash: failure.txHash });
  assert.equal(receipt.status, 'reverted');
  assert.ok(receipt.gasUsed < 1000000n, 'This must not be an out-of-gas revert.');
  let maximumError = false;
  for (let cause = failure, depth = 0; cause && depth < 12; cause = cause.cause, depth++) {
    if (String(cause.message ?? '').includes('ExpiryBeyondMaxLifetime') || cause.data?.errorName === 'ExpiryBeyondMaxLifetime') maximumError = true;
  }
  assert.ok(maximumError, 'Expected the specific protocol maximum-lifetime rejection.');
  console.log(JSON.stringify({ network: 'Rabdi', chainId: 7794095, txHash: failure.txHash, receiptStatus: receipt.status, gasUsed: String(receipt.gasUsed), gasLimit: '1000000', expectedError: 'ExpiryBeyondMaxLifetime', maximumLifetimeBlocks: 7884000, automaticRetry: false, queriesKeyA: 0, queriesKeyB: 0 }, null, 2));
}
main().catch(() => { console.error('Lifetime boundary verification failed. No automatic retry. Inspect the lane receipt before continuing.'); process.exitCode = 1; });
