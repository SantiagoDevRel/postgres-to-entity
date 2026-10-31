import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import { generatedDemo, demoId } from '../shared/demo.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  if (!process.env.ARKIV_ACCESS_KEY || !/^0x[\da-f]{40}$/i.test(process.env.P2E_SAMPLE_OWNER ?? '')) {
    return res.status(503).json({ error: 'Rabdi sample reads need a server access key and sample owner.' });
  }
  try {
    const { schema } = generatedDemo();
    const client = createPublicClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY }), transport: http(undefined, { timeout: 12000, retryCount: 0 }) });
    const result = await client.select({ $key: true, $owner: true, $expiresAt: true, score: true, title: true })
      .from(schema, { onMismatch: 'throw' }).where(eq('id', demoId)).ownedBy(process.env.P2E_SAMPLE_OWNER).limit(1).fetch();
    return res.status(200).json({ network: 'Rabdi', schema: schema.name, entities: result.entities.map(row => ({ key: row.$key, owner: row.$owner, expiresAt: String(row.$expiresAt), score: row.score.value, title: row.title.value })) });
  } catch {
    return res.status(502).json({ error: 'Rabdi sample unavailable. Check access-key configuration or reseed after a network reset.' });
  }
}
