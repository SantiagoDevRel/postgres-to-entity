import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Run in the caller's isolated Chrome context and owned background window. */
export async function verifyRabdi(page, output, origin, { viem } = {}) {
  viem ??= await import('viem');
  const { parseAbi, parseAbiParameters, decodeFunctionData, decodeAbiParameters, encodeEventTopics, encodeAbiParameters, hexToString, toHex } = viem;
  await mkdir(output, { recursive: true });
  const address = '0x1111111111111111111111111111111111111111';
  const registry = '0x4400000000000000000000000000000000000044';
  const hash = '0x' + '22'.repeat(32), blockHash = '0x' + '33'.repeat(32), entityKey = '0x' + '44'.repeat(32);
  const events = parseAbi(['event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)']);
  const checks = [], errors = [], geometry = [], calls = [];
  let funds = true, reject = false, brokenReceipt = false, sent = 0, stored, receipt, quotedGasPrice = 1000000000n;
  page.on('pageerror', error => errors.push(error.message));
  const rpc = async ({ method, params = [] }) => {
    calls.push(method);
    if (method === 'eth_chainId') return '0x76edaf';
    if (method === 'eth_blockNumber') return '0x101';
    if (method === 'eth_gasPrice') return '0x3b9aca00';
    if (method === 'eth_getTransactionCount') { assert.equal(params[1], 'latest'); return '0x0'; }
    if (method === 'eth_getBalance') { assert.equal(params[1], 'latest'); return funds ? '0xde0b6b3a7640000' : '0x0'; }
    if (method === 'eth_getTransactionReceipt') return brokenReceipt && receipt ? { ...receipt, logs: [] } : receipt ?? null;
    if (method === 'arkiv_getEntity') { assert.ok(stored); assert.equal(params[0], entityKey); return stored; }
    throw new Error('Unexpected fixture read: ' + method);
  };
  await page.route('**/api/rpc', async route => {
    const body = route.request().postDataJSON();
    assert.ok(!Array.isArray(body));
    if (body.method === 'eth_chainId' || body.method === 'eth_gasPrice') {
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'Real server must accept the SDK read request.');
      const result = await response.json(); assert.equal(result.error, undefined);
      if (body.method === 'eth_gasPrice') quotedGasPrice = BigInt(result.result);
      await route.fulfill({ response }); return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: await rpc(body) }) });
  });
  await page.exposeFunction('p2eFixtureWallet', async ({ method, params = [] }) => {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [address];
    if (method === 'eth_sendTransaction') {
      if (reject) return { fixtureError: 4001 };
      const tx = params[0];
      assert.equal(tx.from.toLowerCase(), address); assert.equal(tx.to.toLowerCase(), registry);
      assert.equal(BigInt(tx.gas), 1000000n); assert.equal(BigInt(tx.gasPrice), quotedGasPrice); assert.equal(BigInt(tx.nonce), 0n);
      const decoded = decodeFunctionData({ abi: parseAbi(['function execute((uint8 operation, bytes operationData)[] ops) returns (bytes32[] keys)']), data: tx.data });
      assert.equal(decoded.args[0].length, 1); assert.equal(decoded.args[0][0].operation, 1);
      const [creation] = decodeAbiParameters(parseAbiParameters('(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, (bytes32 name, uint8 typeId, bytes value)[] attributes)'), decoded.args[0][0].operationData);
      assert.ok(creation.expiresAt > 257n); assert.ok(creation.expiresAt - 257n <= 7883970n);
      const cells = creation.attributes.map(cell => ({ ...cell, name: hexToString(cell.name).replace(/\0+$/, '') }));
      assert.equal(new Set(cells.map(cell => cell.name)).size, cells.length);
      assert.ok(!cells.some(cell => cell.name.startsWith('$')));
      assert.equal(cells.find(cell => cell.name === 'event_name').typeId, 0x88);
      assert.equal(cells.find(cell => cell.name === 'seat_number').typeId, 2);
      assert.equal(cells.find(cell => cell.name === 'used').typeId, 0x81);
      assert.ok(!cells.some(cell => cell.name === 'buyer_email'));
      const tags = { 1: 'bool', 2: 'i32', 7: 'bytes', 8: 'str' };
      const attributes = cells.map(cell => {
        const type = tags[cell.typeId & 0x7f]; assert.ok(type);
        const value = type === 'str' ? hexToString(cell.value) : type === 'bool' ? BigInt(cell.value) !== 0n : type === 'i32' ? Number(BigInt.asIntN(32, BigInt(cell.value))) : cell.value;
        return { name: cell.name, type, value };
      });
      stored = { key: entityKey, owner: address, creator: address, createdAt: '0x101', updatedAt: '0x101', expiresAt: toHex(creation.expiresAt), creationFlags: creation.creationFlags, attributes };
      const log = { address: registry, topics: encodeEventTopics({ abi: events, eventName: 'EntityCreated', args: { entityKey, owner: address } }), data: encodeAbiParameters(parseAbiParameters('uint64,uint8'), [creation.expiresAt, creation.creationFlags]), blockNumber: '0x101', transactionHash: hash, transactionIndex: '0x0', blockHash, logIndex: '0x0', removed: false };
      receipt = { transactionHash: hash, transactionIndex: '0x0', blockHash, blockNumber: '0x101', from: address, to: registry, gasUsed: '0x2e630', cumulativeGasUsed: '0x2e630', effectiveGasPrice: '0x3b9aca00', logsBloom: '0x' + '00'.repeat(256), logs: [log], status: '0x1', type: '0x0', contractAddress: null };
      sent++; return hash;
    }
    return rpc({ method, params });
  });
  await page.addInitScript(() => {
    const listeners = new Map();
    Object.defineProperty(window, 'ethereum', { configurable: false, value: Object.freeze({
      async request(args) { const result = await window.p2eFixtureWallet(args); if (result?.fixtureError) throw Object.assign(new Error('User rejected fixture request'), { code: result.fixtureError }); return result; },
      on(event, listener) { listeners.set(event, listener); },
      fixtureEmit(event) { listeners.get(event)?.(); },
    }) });
  });
  const nav = async n => { await page.locator('.step-nav [data-go-step="' + n + '"]').click(); };
  const ready = () => page.waitForFunction(() => document.querySelector('#state').textContent === 'Model ready for review');
  const example = async name => {
    await nav(1); await page.locator('[data-example="' + name + '"]').click();
    await page.waitForFunction(() => document.querySelector('#input-status').textContent.startsWith('Schema read.'));
    await nav(2); await page.locator('#generate').click();
    await page.waitForFunction(() => !document.querySelector('.result-panel').hidden && document.querySelector('#state').textContent !== 'Processing…');
  };
  const openDemo = async () => { await nav(3); await page.locator('#open-deploy').click(); };
  await page.goto(origin); await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => typeof window.ethereum?.fixtureEmit), 'function', 'Fixture wallet must be installed before any connection attempt.');
  assert.match(await page.title(), /POSTGRES-TO-ENTITY/);
  await page.waitForFunction(() => document.querySelector('#rabdi-example')?.dataset.loaded === 'true', undefined, { timeout: 30000 });
  checks.push('Hydrated preview displays the owner-filtered real Rabdi seed through its server endpoint.');
  assert.equal(sent, 0);
  for (const name of ['tickets', 'tasks', 'notes', 'social']) {
    await example(name);
    const prompt = await page.locator('#agent-prompt').inputValue();
    assert.match(prompt, /arkiv-entity-model\/3/); assert.match(prompt, /"sdkVersion": "1\.0\.0"/);
    assert.doesNotMatch(prompt, /"payload"|Tiramisu|7738577|Friday concert/);
    checks.push('Built and exported ' + name + ' without illustrative values.');
  }
  await example('tickets'); await openDemo();
  const initial = JSON.parse(await page.locator('#entity-row').inputValue());
  assert.equal(initial.seat_number, 12); assert.equal(initial.used, false); assert.equal(initial.buyer_email, undefined);
  await page.locator('#entity-row').fill(JSON.stringify({ ...initial, event_name: 'Reviewed event', seat_number: 27 }));
  assert.match(await page.locator('#row-attributes').textContent(), /Reviewed event/);
  assert.equal(JSON.parse(await page.locator('#row-stored').textContent()).seat_number, 27);
  await page.locator('#deploy-consent').check(); await page.locator('#entity-row').fill('{ invalid');
  assert.equal(await page.locator('#row-mapping').isVisible(), false); assert.equal(await page.locator('#deploy-consent').isChecked(), false); assert.equal(await page.locator('#deploy').isDisabled(), true);
  await page.locator('#entity-row').fill(JSON.stringify(initial));
  assert.equal(await page.evaluate(() => typeof window.ethereum?.fixtureEmit), 'function', 'Never connect a real extension wallet during acceptance.');
  await page.locator('#connect-wallet').click();
  await page.waitForFunction(() => document.querySelector('#connect-wallet').textContent.startsWith('0x'));
  await page.locator('#deploy-consent').check(); funds = false; await page.locator('#deploy').click();
  await page.waitForFunction(() => document.querySelector('#wallet-status').textContent.includes('needs test GLM')); assert.equal(sent, 0); funds = true;
  await page.locator('#deploy-consent').check(); reject = true; await page.locator('#deploy').click();
  await page.waitForFunction(() => document.querySelector('#wallet-status').textContent.includes('rejected')); assert.equal(sent, 0); reject = false;
  await page.locator('#flag-readonly').selectOption('true'); assert.equal(await page.locator('#deploy-consent').isChecked(), false);
  await page.locator('#deploy-consent').check(); brokenReceipt = true; await page.locator('#deploy').click();
  await page.waitForFunction(() => !!document.querySelector('#check-transaction'), undefined, { timeout: 30000 });
  assert.equal(sent, 1); assert.equal(await page.locator('#deploy').isDisabled(), true);
  brokenReceipt = false; await page.locator('#check-transaction').click();
  await page.waitForFunction(() => document.querySelector('#wallet-status').textContent === 'Entity created and read back successfully.');
  assert.equal(sent, 1); assert.equal(await page.locator('#deploy-consent').isChecked(), false);
  checks.push('Fixture wallet: explicit nonce/gas/gasPrice, typed indexed flags, rejection, funding, consent invalidation, uncertain-write lock and receipt reconciliation.');
  await nav(2); await page.locator('#field-0-4').selectOption('attribute'); await ready(); await openDemo();
  const emailRow = { ...JSON.parse(await page.locator('#entity-row').inputValue()), buyer_email: 'test@gmail.com' };
  await page.locator('#entity-row').fill(JSON.stringify(emailRow));
  assert.match(await page.locator('#row-attributes').textContent(), /test@gmail.com/);
  assert.equal(Object.hasOwn(JSON.parse(await page.locator('#row-stored').textContent()), 'buyer_email'), false);
  await page.locator('#entity-row').fill(JSON.stringify({ ...emailRow, buyer_email: 'é'.repeat(65) }));
  assert.match(await page.locator('#deploy-eligibility').textContent(), /130 UTF-8 bytes.+128/);
  assert.equal(await page.locator('#deploy').isDisabled(), true);
  await nav(2); await page.locator('#field-0-4').selectOption('stored'); await ready(); await openDemo();
  assert.equal(JSON.parse(await page.locator('#row-stored').textContent()).buyer_email, 'é'.repeat(65));
  await nav(2); await page.locator('#field-0-4').selectOption('exclude'); await ready(); await openDemo();
  assert.doesNotMatch(await page.locator('#row-mapping').textContent(), /buyer_email|test@gmail.com/);
  checks.push('Edited row follows stored/indexed/excluded choices; UTF-8 byte bounds reject without truncation.');
  await nav(2); await page.locator('#refine > summary').click();
  await page.locator('#policy-0-owner').selectOption('Another wallet (example only)'); await page.locator('#generate').click(); await ready(); await openDemo();
  await page.locator('#deploy-consent').check(); assert.equal(await page.locator('#deploy').isDisabled(), true); assert.match(await page.locator('#deploy-eligibility').textContent(), /example only/);
  checks.push('Alternate ownership cannot deploy.');
  for (const theme of ['dark', 'light']) for (const width of [320, 390, 519, 520, 521, 682, 683, 684, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await page.evaluate(() => document.fonts.ready);
    const probe = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, body: getComputedStyle(document.body).fontFamily, code: getComputedStyle(document.querySelector('#entity-row')).fontSize, heading: getComputedStyle(document.querySelector('h1')).fontSize }));
    assert.equal(probe.overflow, false, JSON.stringify({ theme, width, ...probe })); assert.match(probe.body, /IBM Plex Mono/); assert.equal(probe.code, '14px'); assert.equal(probe.heading, '32px');
    geometry.push({ theme, width, ...probe });
    if ([390, 768, 1440].includes(width)) { await page.locator('#row-mapping').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(output, theme + '-' + width + '.png') }); }
  }
  await page.setViewportSize({ width: 768, height: 1000 }); await page.evaluate(() => document.documentElement.style.zoom = '2');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot({ path: join(output, 'zoom-200.png') });
  await page.evaluate(() => document.documentElement.style.zoom = '1');
  assert.deepEqual(errors, []);
  const report = { origin, checks, simulatedTransactions: sent, realBrowserWalletTransactions: 0, geometry, errors, calls };
  await writeFile(join(output, 'browser-evidence.json'), JSON.stringify(report, null, 2));
  return report;
}
