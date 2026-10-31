import assert from 'node:assert/strict';
import { createPublicClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { bytes, i32 } from '@arkiv-network/sdk/schema';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { generatedDemo, demoId } from '../sample/shared/demo.mjs';
import { policyWallet } from './rabdi-wallet-policy.mjs';

async function main() {
// Secrets are injected by tools/secrets.mjs. Never source, print or persist them.
if (!process.env.ARKIV_ACCESS_KEY_A) throw new Error('MissingAccessKeyError: inject ARKIV_ACCESS_KEY_A; get an access key at https://hub.arkiv.network/access-keys.');
if (!process.env.TEST_P2E_PRIVATE_KEY || !process.env.TEST_P2E_ADDRESS) throw new Error('Inject the funded TEST_P2E wallet through the secrets runner.');
const account = privateKeyToAccount(process.env.TEST_P2E_PRIVATE_KEY);
assert.equal(account.address.toLowerCase(), process.env.TEST_P2E_ADDRESS.toLowerCase(), 'Lane wallet identity mismatch');
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY_A });
const transport = http(undefined, { timeout: 20000, retryCount: 0 });
const client = createPublicClient({ chain, transport });
const { wallet, state } = policyWallet({ chain, transport, account });
assert.equal(await client.getChainId(), 7794095, 'Unexpected network');
const { model, entity, schema } = generatedDemo();
const existing = await client.select({ $key: true, $owner: true, id: true, score: true, title: true, body: true })
  .from(schema, { onMismatch: 'throw' }).where(eq('id', demoId)).ownedBy(account.address).limit(2).fetch();
let queries = 1;
assert.ok(existing.entities.length <= 1, 'Duplicate seeded identities; inspect without deleting');
let result = existing.entities[0] && { entityKey: existing.entities[0].$key };
let receipt;
if (!result) {
  try {
    result = await wallet.createEntity(schema, { id: demoId, score: i32(31), title: 'Generated on Rabdi', body: bytes(new Uint8Array([0, 1, 255])) },
      { expiration: ExpirationTime.fromBlocks(entity.expirationPolicy.blocks) });
  } catch (error) {
    // Never resend an uncertain write. Preserve a hash without dumping credential-bearing causes.
    console.error(JSON.stringify({ error: 'Seed creation failed or uncertain. Inspect the receipt before any retry.', txHash: error?.txHash ?? null, automaticRetry: false, queriesKeyA: queries }));
    process.exit(1);
  }
  receipt = await client.getTransactionReceipt({ hash: result.txHash });
  assert.equal(receipt.status, 'success', 'Authoritative receipt must succeed');
  assert.ok(receipt.gasUsed <= state.quote.gas, 'Estimated gas budget must cover the successful write');
  const expiry = BigInt(result.expiresAt);
  assert.ok(expiry - receipt.blockNumber >= BigInt(entity.expirationPolicy.blocks), 'Maximum bounded lifetime applied');
  assert.ok(expiry - receipt.blockNumber <= 7884000n, 'Protocol maximum lifetime respected');
}
const readback = await client.getEntity(result.entityKey, schema);
assert.equal(readback.$owner.toLowerCase(), account.address.toLowerCase());
assert.equal(readback.id.value, demoId);
assert.equal(readback.score.value, 31);
assert.equal(readback.title.value, 'Generated on Rabdi');
assert.equal(readback.body.value, '0x0001ff');
const queried = await client.select({ $key: true, score: true }).from(schema, { onMismatch: 'throw' }).where(eq('score', i32(31))).ownedBy(account.address).limit(2).fetch();
queries++;
assert.ok(queried.entities.some(row => row.$key === result.entityKey), 'Generated indexed column must query successfully');
console.log(JSON.stringify({ action: receipt ? 'created' : 'already-seeded', writes: receipt ? 1 : 0, network: 'Rabdi', chainId: chain.id, schema: entity.schema, format: model.format, sdkVersion: model.sdkVersion, entityKey: result.entityKey, txHash: result.txHash ?? null, receiptStatus: receipt?.status ?? null, gasUsed: receipt ? String(receipt.gasUsed) : null, gasLimit: state.quote ? String(state.quote.gas) : null, lifetimeBlocks: entity.expirationPolicy.blocks, queriesKeyA: queries, queriesKeyB: 0, explorer: 'https://rabdi.explorer.arkiv.network/entity/' + result.entityKey }, null, 2));

}
main().catch(() => { console.error("Rabdi seed verification failed. No automatic retry. Inspect the lane transaction before retrying."); process.exitCode = 1; });
