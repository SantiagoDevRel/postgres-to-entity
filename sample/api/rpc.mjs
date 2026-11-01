import { rejectBrowserRequest } from '../shared/request-guard.mjs';
const address = value => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const head = value => value === 'latest' || value === 'pending';

export function allowedRead(body) {
  if (!body || Array.isArray(body) || body.jsonrpc !== '2.0' || (body.params !== undefined && !Array.isArray(body.params))) return false;
  if (!Number.isSafeInteger(body.id) && !(typeof body.id === 'string' && body.id.length <= 64)) return false;
  const p = body.params ?? [];
  switch (body.method) {
    case 'eth_chainId': case 'eth_blockNumber': case 'eth_gasPrice': return p.length === 0;
    case 'eth_getBalance': case 'eth_getTransactionCount': return p.length === 2 && address(p[0]) && head(p[1]);
    case 'eth_getTransactionReceipt': case 'arkiv_getEntity': return p.length === 1 && hash(p[0]);
    default: return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (rejectBrowserRequest(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST for a supported read.' });
  const key = process.env.ARKIV_ACCESS_KEY;
  if (!key) return res.status(503).json({ error: 'Rabdi reads need a server-side ARKIV_ACCESS_KEY. Get an access key at https://hub.arkiv.network/access-keys.' });
  try {
    if (Number(req.headers['content-length'] ?? 0) > 4096) return res.status(413).json({ error: 'Read request too large.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!allowedRead(body) || JSON.stringify(body).length > 4096) return res.status(400).json({ error: 'Unsupported read. Writes, queries and historical state are not accepted here.' });
    const response = await fetch('https://rpc.rabdi.db-chain.testnet.arkiv.network/' + encodeURIComponent(key), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return res.status(502).json({ error: 'Rabdi read unavailable. Try again later.' });
    const data = await response.json();
    // Never forward transport errors: an upstream message can contain its credentialed URL.
    return res.status(200).json(data.error
      ? { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'Rabdi read failed. Read current state with latest or pending.' } }
      : { jsonrpc: '2.0', id: body.id, result: data.result });
  } catch {
    return res.status(502).json({ error: 'Rabdi read unavailable. Check the server access-key configuration.' });
  }
}
