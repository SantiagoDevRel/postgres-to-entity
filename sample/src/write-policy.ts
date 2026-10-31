/** Unsigned estimation uses the wallet's RPC, so row data never reaches our read proxy. */
export type PolicyProvider = { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
export type WriteQuote = { estimate: bigint; gas: bigint; headGasLimit: bigint; nonce: string; gasPrice: string };
export class WritePolicyError extends Error {
  constructor(message: string) { super(message); this.name = 'WritePolicyError'; }
}
const quantity = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^0x[\da-f]+$/i.test(value)) throw new WritePolicyError('Invalid Rabdi gas or nonce response. Creation stopped.');
  return BigInt(value);
};

/** One send only. Errors, timeouts and uncertain results are never retried here. */
export async function sendWithPolicy(provider: PolicyProvider, transaction: Record<string, unknown>,
  beforeSend: () => Promise<void>, onHash: (hash: string) => void,
  onQuote?: (quote: WriteQuote) => void): Promise<unknown> {
  const [nonce, gasPrice] = await Promise.all([
    provider.request({ method: 'eth_getTransactionCount', params: [transaction.from, 'latest'] }),
    provider.request({ method: 'eth_gasPrice' }),
  ]);
  quantity(nonce); quantity(gasPrice);
  const unsigned: Record<string, unknown> = { ...transaction, nonce, gasPrice };
  // Replace any caller gas hint: estimation must assess the complete SDK-encoded request.
  delete unsigned.gas;
  let estimate: bigint;
  try { estimate = quantity(await provider.request({ method: 'eth_estimateGas', params: [unsigned, 'latest'] })); }
  catch { throw new WritePolicyError('Rabdi gas estimation failed at latest. No transaction was sent. Check the row and wallet RPC before trying again.'); }
  if (estimate <= 0n) throw new WritePolicyError('Rabdi returned an empty gas estimate. No transaction was sent.');
  const gas = estimate * 2n > 1000000n ? estimate * 2n : 1000000n;
  const [head, freshNonce] = await Promise.all([
    provider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] }),
    provider.request({ method: 'eth_getTransactionCount', params: [transaction.from, 'latest'] }),
  ]);
  const headGasLimit = quantity((head as { gasLimit?: unknown } | null)?.gasLimit);
  if (gas > headGasLimit / 2n) throw new WritePolicyError('This row needs more than 50% of the latest block gas limit with safety headroom. Split it into smaller entities or reduce the row; nothing was sent.');
  if (quantity(freshNonce) !== quantity(nonce)) throw new WritePolicyError('Wallet nonce changed during estimation. Review and try again; nothing was sent.');
  await beforeSend();
  onQuote?.({ estimate, gas, headGasLimit, nonce: nonce as string, gasPrice: gasPrice as string });
  const response = await provider.request({ method: 'eth_sendTransaction', params: [{ ...unsigned, gas: '0x' + gas.toString(16) }] });
  if (typeof response === 'string' && /^0x[\da-f]{64}$/i.test(response)) onHash(response);
  return response;
}
