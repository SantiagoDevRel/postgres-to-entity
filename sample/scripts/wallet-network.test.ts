import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// A keyed Rabdi RPC URL (access key in the path) must never reach a wallet, the bundle, a URL or a QR.
const KEYLESS = 'https://rpc.rabdi.db-chain.testnet.arkiv.network';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

function stubWallet(knowsRabdi: boolean) {
  const calls: { method: string; params?: unknown }[] = [];
  return { calls, request: async (args: { method: string; params?: unknown }) => {
    calls.push(args);
    if (args.method === 'wallet_switchEthereumChain' && !knowsRabdi && !calls.some(call => call.method === 'wallet_addEthereumChain')) throw Object.assign(new Error('Unrecognized chain'), { code: 4902 });
    return null;
  } };
}

test('a wallet without Rabdi is offered only the keyless public RPC', async () => {
  const { switchToRabdi, RABDI_PUBLIC_RPC } = await import('../src/wallet-network.ts');
  assert.equal(RABDI_PUBLIC_RPC, KEYLESS);
  const wallet = stubWallet(false);
  await switchToRabdi(wallet, 7794095);
  assert.deepEqual(wallet.calls.map(call => call.method), ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
  const [params] = wallet.calls[1].params as [{ chainId: string; rpcUrls: string[] }];
  assert.equal(params.chainId, '0x76edaf');
  assert.deepEqual(params.rpcUrls, [KEYLESS]);
  for (const url of params.rpcUrls) { const parsed = new URL(url); assert.equal(parsed.pathname, '/'); assert.equal(parsed.search + parsed.hash + parsed.username + parsed.password, ''); }
});

test('a wallet that already has Rabdi is only switched, never re-added', async () => {
  const { switchToRabdi } = await import('../src/wallet-network.ts');
  const wallet = stubWallet(true);
  await switchToRabdi(wallet, 7794095);
  assert.deepEqual(wallet.calls.map(call => call.method), ['wallet_switchEthereumChain']);
});

test('the sample never tells users to put an access key in their wallet', () => {
  const [html, deployment, network, readme, agents] = ['../index.html', '../src/deployment.ts', '../src/network.ts', '../README.md', '../AGENTS.md'].map(read);
  for (const text of [html, deployment, network, readme, agents]) {
    assert.doesNotMatch(text, /wallet (using|with) your own access key|own access key|already configured (by the user )?in (their|the user's) wallet/i);
    assert.doesNotMatch(text, /rpc\.rabdi\.db-chain\.testnet\.arkiv\.network\/(?![`'"\s)])/, 'no keyed RPC URL literal');
  }
  assert.match(deployment, /switchToRabdi\(/);
  assert.doesNotMatch(deployment, /wallet_addEthereumChain/, 'adding the chain goes through wallet-network.ts only');
  assert.match(html, /keyless public RPC/);
  assert.match(readme, /https:\/\/rpc\.rabdi\.db-chain\.testnet\.arkiv\.network(?![\w/])/);
});
