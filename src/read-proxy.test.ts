import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error JavaScript Vercel handler deliberately shares no browser dependencies.
import handler, { allowedRead } from '../sample/api/rpc.mjs';

test('read proxy rejects signing, arbitrary queries, batches and historical state', () => {
  const request = (method: string, params: unknown[]) => ({ jsonrpc: '2.0', id: 1, method, params });
  const address = '0x' + '1'.repeat(40), hash = '0x' + '1'.repeat(64);
  for (const tag of ['latest', 'pending']) assert.ok(allowedRead(request('eth_getBalance', [address, tag])));
  for (const tag of ['safe', 'finalized', '0x1', hash]) assert.equal(allowedRead(request('eth_getTransactionCount', [address, tag])), false);
  for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'personal_sign', 'eth_call', 'arkiv_query']) assert.equal(allowedRead(request(method, [])), false);
  assert.equal(allowedRead([request('eth_chainId', [])]), false);
  assert.equal(allowedRead(request('arkiv_getEntity', [hash])), true);
  assert.equal(allowedRead(request('arkiv_getEntity', [address])), false);
  assert.equal(allowedRead(request('eth_chainId', [1])), false);
  assert.equal(allowedRead({ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }), true);
  assert.equal(allowedRead({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice' }), true);
  assert.equal(allowedRead({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance' }), false);
  assert.equal(allowedRead({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: null }), false);
});

test('read proxy fails closed and never exposes upstream errors or access keys', async () => {
  const originalKey = process.env.ARKIV_ACCESS_KEY, originalFetch = globalThis.fetch;
  const response = () => ({ code: 0, body: undefined as unknown, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value; }, status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; return this; } });
  const req = { method: 'POST', headers: {}, body: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] } };
  try {
    delete process.env.ARKIV_ACCESS_KEY;
    const missing = response(); await handler(req, missing); assert.equal(missing.code, 503);
    process.env.ARKIV_ACCESS_KEY = 'dummy-access-value';
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'https://rpc.example/dummy-access-value' } }));
    const failed = response(); await handler(req, failed); assert.doesNotMatch(JSON.stringify(failed.body), /dummy-access-value|rpc\.example/);
    assert.equal(failed.headers['Cache-Control'], 'no-store');
    globalThis.fetch = async () => { throw new Error('dummy-access-value'); };
    const exception = response(); await handler(req, exception); assert.equal(exception.code, 502); assert.doesNotMatch(JSON.stringify(exception.body), /dummy-access-value/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ARKIV_ACCESS_KEY; else process.env.ARKIV_ACCESS_KEY = originalKey;
  }
});
