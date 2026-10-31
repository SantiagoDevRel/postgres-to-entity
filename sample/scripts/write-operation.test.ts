import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeWrite, newWriteOperation, operationKey, reconcileWrite, type Hash, type WriteIO } from '../src/write-operation.ts';
import { WritePolicyError } from '../src/write-policy.ts';
const hash = ('0x' + 'ab'.repeat(32)) as Hash, entityKey = ('0x' + 'cd'.repeat(32)) as Hash;
const reverted = () => Object.assign(new Error(`Transaction ${hash} reverted. No reason provided by backend.`), { name: 'EntityMutationError', txHash: hash });

test('COMMON 1: non-gas confirmed revert permits one send despite three new clicks', async () => {
  const operation = newWriteOperation(); let sends = 0;
  const io: WriteIO = { async send(_, attempted) { sends++; attempted(1000000n); throw reverted(); }, async receipt() { return { status: 'reverted', gasUsed: 100000n }; } };
  for (let i = 0; i < 3; i++) await executeWrite(operation, io);
  assert.equal(sends, 1); assert.equal(operation.attempts, 1); assert.equal(operation.phase, 'terminal');
});
test('COMMON 2: gas-exhausted confirmed revert retries exactly once at twice previous gas', async () => {
  const operation = newWriteOperation(); let sends = 0;
  const io: WriteIO = { async send(minimum, attempted) {
    sends++; assert.equal(operation.phase, 'sending');
    if (sends === 1) { assert.equal(minimum, 0n); attempted(1000000n); throw reverted(); }
    assert.equal(minimum, 2000000n); attempted(minimum); return { txHash: hash, entityKey };
  }, async receipt() { return sends === 1 ? { status: 'reverted', gasUsed: 1000000n } : { status: 'success', gasUsed: 1200000n }; } };
  await executeWrite(operation, io); await executeWrite(operation, io);
  assert.equal(sends, 2); assert.equal(operation.attempts, 2); assert.equal(operation.phase, 'confirmed');
});
test('COMMON 3: SDK success followed by gas-exhausted disagreeing lookup never retries', async () => {
  const operation = newWriteOperation(); let sends = 0;
  const io: WriteIO = { async send(_, attempted) { sends++; attempted(1000000n); return { txHash: hash, entityKey }; }, async receipt() {
    assert.equal(operation.phase, 'submitted'); assert.equal(operation.hash, hash);
    return { status: 'reverted', gasUsed: 1000000n };
  } };
  await executeWrite(operation, io); await executeWrite(operation, io);
  assert.equal(sends, 1); assert.equal(operation.phase, 'receipt-disagrees');
});
test('COMMON 4: SDK success then null lookup and a new click permits one send', async () => {
  const operation = newWriteOperation(); let sends = 0;
  const io: WriteIO = { async send(_, attempted) { sends++; attempted(1000000n); return { txHash: hash, entityKey }; }, async receipt() { return null; } };
  await executeWrite(operation, io); await executeWrite(operation, io);
  await reconcileWrite(operation, async () => ({ status: 'reverted', gasUsed: 1000000n }));
  await executeWrite(operation, io);
  assert.equal(sends, 1); assert.equal(operation.hash, hash); assert.equal(operation.phase, 'receipt-disagrees');
});
test('COMMON 5: uncertain SDK error with or without a hash permits one send', async () => {
  for (const candidate of [undefined, hash]) {
    const operation = newWriteOperation(); let sends = 0;
    const io: WriteIO = { async send(_, attempted, hashed) { sends++; attempted(1000000n); if (candidate) hashed(candidate); throw Error('Transport timeout'); }, async receipt() { return null; } };
    await executeWrite(operation, io); await executeWrite(operation, io);
    assert.equal(sends, 1); assert.equal(operation.phase, 'uncertain'); assert.equal(operation.hash, candidate);
  }
});
test('a second gas-exhausted revert is terminal, never a third attempt', async () => {
  const operation = newWriteOperation(); let sends = 0;
  const io: WriteIO = { async send(minimum, attempted) { sends++; attempted(minimum || 1000000n); throw reverted(); }, async receipt() { return { status: 'reverted', gasUsed: operation.gas! }; } };
  for (let i = 0; i < 4; i++) await executeWrite(operation, io);
  assert.equal(sends, 2); assert.equal(operation.phase, 'terminal');
});
test('operation record guards network entry and stable identity survives rerenders', async () => {
  const operation = newWriteOperation(); let sends = 0, release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const io: WriteIO = { async send(_, attempted) { assert.equal(operation.phase, 'sending'); sends++; attempted(1000000n); await waiting; return { txHash: hash, entityKey }; }, async receipt() { return null; } };
  const first = executeWrite(operation, io); await executeWrite(operation, io); release(); await first;
  assert.equal(sends, 1);
  assert.equal(operationKey('0xAB', 't', [['b', 2], ['a', 1]]), operationKey('0xab', 't', [['a', 1], ['b', 2]]));
});

test('a retry rejected by fresh estimation/head cap sends nothing and retains the prior receipt separately', async () => {
  const operation = newWriteOperation();let calls=0,sends=0;
  const io:WriteIO={async send(minimum,attempted){
    calls++;if(calls===1){sends++;attempted(1000000n);throw reverted();}
    assert.equal(minimum,2000000n);throw new WritePolicyError('Half-head budget exceeded before sending');
  },async receipt(){return{status:'reverted',gasUsed:1000000n};}};
  await executeWrite(operation,io);await executeWrite(operation,io);
  assert.equal(sends,1);assert.equal(calls,2);assert.equal(operation.phase,'terminal');
  assert.equal(operation.previousHash,hash);assert.equal(operation.hash,undefined);
});

test('an unclassified SDK transport error is uncertain even without a transport attempt signal', async () => {
  const operation=newWriteOperation();let sdkCalls=0;
  const io:WriteIO={async send(){sdkCalls++;throw Error('SDK transport timeout without a hash');},async receipt(){return null;}};
  await executeWrite(operation,io);await executeWrite(operation,io);
  assert.equal(sdkCalls,1);assert.equal(operation.phase,'uncertain');
});
