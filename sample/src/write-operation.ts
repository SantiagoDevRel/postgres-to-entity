export type Hash = `0x${string}`;
export type WriteResult = { txHash: Hash; entityKey: Hash };
export type Receipt = { status: 'success' | 'reverted'; gasUsed: bigint };
export type WritePhase = 'idle' | 'sending' | 'submitted' | 'confirmed' | 'confirmation-pending' | 'receipt-disagrees' | 'uncertain' | 'terminal';
export type WriteOperation = { phase: WritePhase; attempts: number; gas?: bigint; hash?: Hash; previousHash?: Hash; result?: WriteResult; message: string };
export type WriteIO = {
  send(minimumGas: bigint, attempted: (gas: bigint) => void, hashed: (hash: Hash) => void): Promise<WriteResult>;
  receipt(hash: Hash): Promise<Receipt | null>;
  message?(error: unknown): string;
};
export const newWriteOperation = (): WriteOperation => ({ phase: 'idle', attempts: 0, message: '' });
export function operationKey(owner: string, source: string, identity: Array<[string, unknown]>): string {
  return JSON.stringify([7794095, owner.toLowerCase(), source, [...identity].sort(([a], [b]) => a.localeCompare(b))], (_, v) => typeof v === 'bigint' ? v.toString() : v);
}
function sdkFailure(error: unknown): { hash?: Hash; confirmedRevert: boolean; stoppedBeforeSend: boolean } {
  let hash: Hash | undefined, confirmedRevert = false, stoppedBeforeSend = false;
  const seen = new Set<unknown>();
  for (let cause = error; cause && typeof cause === 'object' && !seen.has(cause);) {
    seen.add(cause);
    const item = cause as { txHash?: unknown; name?: string; message?: string; cause?: unknown };
    if (typeof item.txHash === 'string' && /^0x[\da-f]{64}$/i.test(item.txHash)) hash = item.txHash as Hash;
    // SDK 1.0 sendArkivTransaction reports an authoritative revert using this type/message.
    if (item.name === 'EntityMutationError' && /^Transaction 0x[\da-f]{64} reverted\./i.test(item.message ?? '')) confirmedRevert = true;
    if (item.name === 'WritePolicyError') stoppedBeforeSend = true;
    cause = item.cause;
  }
  return { hash, confirmedRevert, stoppedBeforeSend };
}
/** Read-only reconciliation can never reopen a send, including after a disagreeing revert. */
export async function reconcileWrite(operation: WriteOperation, lookup: WriteIO['receipt']): Promise<WriteOperation> {
  if (!operation.hash || operation.phase === 'terminal') return operation;
  try {
    const receipt = await lookup(operation.hash);
    if (!receipt) { operation.phase = 'confirmation-pending'; operation.message = 'Confirmation pending. Check this transaction before retrying; this operation will not send again.'; }
    else if (receipt.status !== 'success') { operation.phase = 'receipt-disagrees'; operation.message = 'Receipt disagrees with the submitted result. Check the transaction; this operation will not send again.'; }
    else { operation.phase = 'confirmed'; operation.message = 'Transaction confirmed. This operation will not send again.'; }
  } catch { operation.phase = 'confirmation-pending'; operation.message = 'Confirmation pending. Check this transaction before retrying; this operation will not send again.'; }
  return operation;
}
/** The caller keeps this record by source identity across renders and clicks. */
export async function executeWrite(operation: WriteOperation, io: WriteIO): Promise<WriteOperation> {
  if (operation.phase !== 'idle' || operation.attempts >= 2) return operation;
  operation.phase = 'sending'; // Before any network call, including preflight/estimation.
  let minimumGas = 0n;
  for (;;) {
    const previousAttempts = operation.attempts;
    let result: WriteResult;
    try {
      result = await io.send(minimumGas, gas => {
        if (operation.attempts >= 2) throw Error('Maximum two attempts for this operation.');
        operation.gas = gas; operation.attempts++;
      }, hash => { operation.hash = hash; });
    } catch (error) {
      const failure = sdkFailure(error);
      // A failed preflight/estimate provably never invoked a wallet send.
      if (failure.stoppedBeforeSend && operation.attempts === previousAttempts && !failure.hash && !operation.hash) {
        operation.phase = previousAttempts === 0 ? 'idle' : 'terminal';
        operation.message = io.message?.(error) ?? (error instanceof Error ? error.message : 'Creation stopped before sending.');
        return operation;
      }
      operation.hash = failure.hash ?? operation.hash;
      if (failure.confirmedRevert && operation.hash) {
        let receipt: Receipt | null;
        try { receipt = await io.receipt(operation.hash); } catch { receipt = null; }
        if (receipt?.status === 'reverted') {
          if (previousAttempts === 0 && operation.attempts === 1 && operation.gas !== undefined && receipt.gasUsed === operation.gas) {
            minimumGas = operation.gas * 2n;
            operation.previousHash = operation.hash; delete operation.hash;
            operation.phase = 'sending'; operation.message = 'Confirmed gas exhaustion. One retry will be estimated with a larger gas budget.';
            continue;
          }
          operation.phase = 'terminal'; operation.message = 'Confirmed revert. This operation is closed; no further send is allowed.';
          return operation;
        }
      }
      operation.phase = 'uncertain'; operation.message = 'Transaction outcome uncertain. ' + (io.message?.(error) ?? '') + ' Check before retrying; this operation will not send again.';
      return operation;
    }
    // SDK success is irreversible for the send guard, BEFORE any later receipt lookup.
    operation.hash = result.txHash; operation.result = result; operation.phase = 'submitted';
    return reconcileWrite(operation, io.receipt);
  }
}
