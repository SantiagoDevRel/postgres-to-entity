import assert from 'node:assert/strict';
import { createWalletClient } from '@arkiv-network/sdk';
import { createPublicClient, createWalletClient as createSigner, custom } from 'viem';
import { sendWithPolicy } from '../sample/src/write-policy.ts';

/** Exercise the sample's exact unsigned-request policy using the lane's local signer. */
export function policyWallet({ account, chain, transport }) {
  const reads = createPublicClient({ chain, transport });
  const signer = createSigner({ chain, transport, account });
  const state = { quote: null, txHash: null, sendStarted: false };
  const provider = { async request(args) {
    if (args.method !== 'eth_sendTransaction') return reads.request(args);
    const tx = args.params[0];
    assert.equal(tx.from.toLowerCase(), account.address.toLowerCase());
    assert.ok(state.sendStarted, 'Policy must authorize the send');
    return signer.sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value ?? '0x0'),
      gas: BigInt(tx.gas), nonce: Number(BigInt(tx.nonce)), gasPrice: BigInt(tx.gasPrice), type: 'legacy' });
  } };
  const guarded = { request(args) {
    if (args.method === 'wallet_sendTransaction' || args.method === 'eth_sendRawTransaction') throw Error('Alternate write fallback refused. Inspect the first attempt.');
    if (args.method !== 'eth_sendTransaction') return provider.request(args);
    if (state.sendStarted) throw Error('A send was already attempted. Inspect its result; never resend automatically.');
    return sendWithPolicy(provider, args.params[0], async () => {
      assert.equal(await reads.getChainId(), 7794095);
      state.sendStarted = true;
    }, hash => { state.txHash = hash; }, quote => { state.quote = quote; });
  } };
  return { wallet: createWalletClient({ account: account.address, chain, transport: custom(guarded, { retryCount: 0 }) }), state };
}
