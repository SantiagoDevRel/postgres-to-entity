import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  const { switchToRabdi, RABDI_PUBLIC_RPC } = await import('../src/rabdi-switch.ts');
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
  const { switchToRabdi } = await import('../src/rabdi-switch.ts');
  const wallet = stubWallet(true);
  await switchToRabdi(wallet, 7794095);
  assert.deepEqual(wallet.calls.map(call => call.method), ['wallet_switchEthereumChain']);
});

// MetaMask Mobile wraps EIP-3326 4902 in -32603 (data.originalError.code, originalError.code or only the message).
const wrapped4902: [string, () => Error][] = [
  ['data.originalError.code 4902', () => Object.assign(new Error('Internal JSON-RPC error.'), { code: -32603, data: { originalError: { code: 4902 } } })],
  ['originalError.code 4902', () => Object.assign(new Error('Internal JSON-RPC error.'), { code: -32603, originalError: { code: 4902 } })],
  ['"Unrecognized chain ID" message', () => Object.assign(new Error('Unrecognized chain ID "0x76edaf". Try adding the chain using wallet_addEthereumChain first.'), { code: -32603 })],
];
function wrappingWallet(makeError: () => Error) {
  const calls: { method: string; params?: unknown }[] = [];
  return { calls, request: async (args: { method: string; params?: unknown }) => {
    calls.push(args);
    if (args.method === 'wallet_switchEthereumChain' && !calls.some(call => call.method === 'wallet_addEthereumChain')) throw makeError();
    return null;
  } };
}

for (const [name, makeError] of wrapped4902) {
  test(`a wallet that wraps 4902 as -32603 (${name}) gets the keyless add and a switch`, async () => {
    const { switchToRabdi } = await import('../src/rabdi-switch.ts');
    const wallet = wrappingWallet(makeError);
    await switchToRabdi(wallet, 7794095);
    assert.deepEqual(wallet.calls.map(call => call.method), ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
    const [params] = wallet.calls[1].params as [{ chainId: string; rpcUrls: string[] }];
    assert.equal(params.chainId, '0x76edaf');
    assert.deepEqual(params.rpcUrls, [KEYLESS]);
  });
}

for (const [name, error] of [
  ['bare -32603', Object.assign(new Error('Internal JSON-RPC error.'), { code: -32603 })],
  ['-32603 wrapping 4001', Object.assign(new Error('Internal JSON-RPC error.'), { code: -32603, data: { originalError: { code: 4001 } } })],
  ['4001 user rejection', Object.assign(new Error('User rejected the request.'), { code: 4001 })],
  ['-32002 pending request', Object.assign(new Error('Request already pending'), { code: -32002 })],
] as [string, Error][]) {
  test(`an unrelated switch error (${name}) is rethrown and never adds a network`, async () => {
    const { switchToRabdi } = await import('../src/rabdi-switch.ts');
    const wallet = wrappingWallet(() => error);
    await assert.rejects(switchToRabdi(wallet, 7794095), (thrown: unknown) => thrown === error);
    assert.deepEqual(wallet.calls.map(call => call.method), ['wallet_switchEthereumChain']);
  });
}

test('the sample never tells users to put an access key in their wallet', () => {
  // The package docs (../../README.md, ../../AGENTS.md) are checked by scripts/lint.mjs: release checks run this file in a copy without them.
  const [html, deployment, network, readme, agents] = ['../index.html', '../src/deployment.ts', '../src/network.ts', '../README.md', '../AGENTS.md'].map(read);
  for (const text of [html, deployment, network, readme, agents]) {
    assert.doesNotMatch(text, /wallet (using|with) your own access key|own access key|already configured (by the user )?in (their|the user's) wallet|user's configured (Rabdi )?RPC/i);
    assert.doesNotMatch(text, /rpc\.rabdi\.db-chain\.testnet\.arkiv\.network\/(?![`'"\s)])/, 'no keyed RPC URL literal');
  }
  assert.match(deployment, /switchToRabdi\(/);
  assert.doesNotMatch(deployment, /wallet_addEthereumChain/, 'adding the chain goes through rabdi-switch.ts only');
  assert.match(html, /keyless public RPC/);
  assert.match(readme, /https:\/\/rpc\.rabdi\.db-chain\.testnet\.arkiv\.network(?![\w/])/);
});

test('every client source file survives .vercelignore', () => {
  // The remote Vercel build only sees uploaded files; an excluded src module breaks the production build.
  const excluded = read('../.vercelignore').split(/\r?\n/).filter(line => line.startsWith('**/'))
    .map(line => new RegExp('^' + line.slice(3).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
  const walk = (dir: URL): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(new URL(entry.name + '/', dir)) : [entry.name]);
  const names = walk(new URL('../src/', import.meta.url));
  assert.ok(names.includes('rabdi-switch.ts'));
  for (const name of names) for (const pattern of excluded) assert.doesNotMatch(name, pattern, `src file ${name} is excluded from deployments by .vercelignore`);
});
