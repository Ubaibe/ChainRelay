
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runPreflightChecks, validateAccountSnapshot, SPENDABILITY } = require('../src/preflight');
const { SUPPORTED_ACTIONS } = require('../src/intent');

const mockBlockHash = { toHex: () => '0xabc' };
function mockApi() {
  return {
    rpc: {
      chain: { getFinalizedHead: async () => mockBlockHash },
      payment: { queryInfo: async () => ({ partialFee: { toString: () => '1000' }, weight: { toString: () => '100' }, class: { toString: () => 'Normal' }, paysFee: null }) },
      system: { dryRun: async () => ({ Ok: { Ok: true } }) },
    },
    tx: { balances: {} },
    query: { system: { account: async () => ({ data: { free: 100000000000000n, reserved: 0n, miscFrozen: 0n, feeFrozen: 0n } }) } },
  };
}
function baseIntent(overrides = {}) {
  return Object.assign({ intentId: 'test', action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE, asset: 'POT', amount: '1', recipient: '5H728gx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq', signer: '5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq', createdAt: 1700000000000 }, overrides);
}

test('preflight fixed transfer: amount+fee exceeds spendable', async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE, amount: '1' });
  const feeEstimate = { partialFee: '10000000000000', method: 'paymentInfo' };
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: '50000000000000', reserved: '0', miscFrozen: '0', feeFrozen: '0' }, recipient: { free: '1000', reserved: '0', miscFrozen: '0', feeFrozen: '0' } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.checks.senderBalance.spendability, 'INSUFFICIENT');
});

test('preflight fixed transfer: amount+fee affordable', async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE, amount: '1' });
  const feeEstimate = { partialFee: '10000000000000', method: 'paymentInfo' };
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: '200000000000000', reserved: '0', miscFrozen: '0', feeFrozen: '0' }, recipient: { free: '1000', reserved: '0', miscFrozen: '0', feeFrozen: '0' } },
  }, api);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.checks.senderBalance.spendability, 'SUFFICIENT');
});

test('preflight TRANSFER_ALL with unknown frozen breakdown (V3)', async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_ALL, amount: 'ignored' });
  const feeEstimate = { partialFee: '10000000000000', method: 'paymentInfo' };
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: '200000000000000', reserved: '0', frozen: '50000000000000', flags: '0' }, recipient: { free: '1000', reserved: '0', frozen: '0', flags: '0' } },
  }, api);
  assert.strictEqual(result.checks.senderBalance.feeOnly, true);
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes('breakdown') || w.toLowerCase().includes('frozen')));
});

test('preflight missing fee estimate throws', async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE, amount: '1' });
  await assert.rejects(runPreflightChecks({ intent, feeEstimate: {}, accounts: { signer: { free: '200000000000000', reserved: '0', miscFrozen: '0', feeFrozen: '0' }, recipient: { free: '0', reserved: '0', miscFrozen: '0', feeFrozen: '0' } } }, api), /Fee estimate/);
});

test('validate missing free balance rejected', async () => {
  const res = validateAccountSnapshot({ reserved: '0', miscFrozen: '0', feeFrozen: '0' }, 'signer');
  assert.strictEqual(res.valid, false);
});

test('validate malformed free balance rejected', async () => {
  const res = validateAccountSnapshot({ free: 'abc', reserved: '0', miscFrozen: '0', feeFrozen: '0' }, 'signer');
  assert.strictEqual(res.valid, false);
});

test('validate legacy layout accepted', async () => {
  const res = validateAccountSnapshot({ free: '100', reserved: '0', miscFrozen: '5', feeFrozen: '2' }, 'signer');
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.data.frozenBreakdownKnown, true);
});

test('validate V3 layout', async () => {
  const res = validateAccountSnapshot({ free: '100', reserved: '0', frozen: '10', flags: '0' }, 'signer');
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.data.frozenBreakdownKnown, false);
  assert.strictEqual(res.data.miscFrozen, null);
  assert.strictEqual(res.data.feeFrozen, null);
});

test('V3 frozen 0 with unknown breakdown', async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE, amount: '1' });
  const feeEstimate = { partialFee: '10000000000000', method: 'paymentInfo' };
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: '200000000000000', reserved: '0', frozen: '0', flags: '0' }, recipient: { free: '1000', reserved: '0', frozen: '0', flags: '0' } },
  }, api);
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes('breakdown')));
});

test('V3 nonzero frozen with unknown breakdown causes insufficient if balances low', async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE, amount: '1' });
  const feeEstimate = { partialFee: '10000000000000', method: 'paymentInfo' };
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: '50000000000000', reserved: '0', frozen: '100000000000000', flags: '0' }, recipient: { free: '1000', reserved: '0', frozen: '0', flags: '0' } },
  }, api);
  assert.strictEqual(result.checks.senderBalance.spendability, 'INSUFFICIENT');
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes('frozen')));
});

