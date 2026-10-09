const { test } = require("node:test");
const assert = require("node:assert");

const {
  buildExecutionPlan,
  constructTransferCall,
  validatePlan,
} = require("../src/plan");
const { toBaseUnits } = require("../src/amount");
const { SUPPORTED_ACTIONS, INTENT_STATUS } = require("../src/intent");
const { Keyring } = require("@polkadot/keyring");
const { createExecutionReceipt } = require("../src/receipt");

const keyring = new Keyring({ type: "sr25519" });
const VALID_SIGNER = keyring.addFromSeed(new Uint8Array(32)).address;
const VALID_RECIPIENT = keyring.addFromSeed(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])).address;

// Mock api — returns a callable stub for each extrinsic
function mockApi() {
  const makeTx = (name) => ({
    __name: name,
    meta: { args: [{ name: "dest", type: "LookupSource" }] },
  });
  return {
    tx: {
      balances: {
        transfer: (dest, value) => ({ __call: "transfer", dest, value }),
        transferKeepAlive: (dest, value) => ({ __call: "transferKeepAlive", dest, value }),
        transferAll: (dest, keepAlive) => ({ __call: "transferAll", dest, keepAlive }),
      },
    },
  };
}

function baseIntent(overrides = {}) {
  return {
    intentId: "cr_test123",
    action: SUPPORTED_ACTIONS.TRANSFER,
    asset: "POT",
    amount: "1.5",
    recipient: VALID_RECIPIENT,
    signer: VALID_SIGNER,
    deadline: Date.now() + 60000,
    status: INTENT_STATUS.VALIDATED,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Plan tests
// ---------------------------------------------------------------------------

test("Valid intent produces the expected 9-step plan", () => {
  const api = mockApi();
  const plan = buildExecutionPlan(baseIntent(), api);
  assert.strictEqual(plan.steps.length, 9);
});

test("Plan preserves recipient exactly", () => {
  const api = mockApi();
  const plan = buildExecutionPlan(baseIntent(), api);
  assert.strictEqual(plan.recipient, VALID_RECIPIENT);
});

test("Plan preserves amount exactly", () => {
  const api = mockApi();
  const plan = buildExecutionPlan(baseIntent({ amount: "1.5" }), api);
  assert.strictEqual(plan.amount, "1.5");
});

test("validatePlan() accepts a valid plan", () => {
  const api = mockApi();
  const plan = buildExecutionPlan(baseIntent(), api);
  const result = validatePlan(plan);
  assert.strictEqual(result.valid, true);
});

test("toBaseUnits('1') returns 100000000000000n", () => {
  assert.strictEqual(toBaseUnits("1"), 100000000000000n);
});

test("toBaseUnits('0.1') returns 10000000000000n", () => {
  assert.strictEqual(toBaseUnits("0.1"), 10000000000000n);
});

test("toBaseUnits('0.00000000000001') returns 1n", () => {
  assert.strictEqual(toBaseUnits("0.00000000000001"), 1n);
});

test("toBaseUnits('123.456') returns 12345600000000000n", () => {
  assert.strictEqual(toBaseUnits("123.456"), 12345600000000000n);
});

test("constructTransferCall uses exact BigInt for transfer", () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER, amount: "1.5" });
  const { call, params } = constructTransferCall(intent, api);
  assert.strictEqual(params.value, "150000000000000");
  assert.strictEqual(call.value, 150000000000000n);
  assert.strictEqual(params.dest, VALID_RECIPIENT);
});

test("constructTransferCall uses exact BigInt for transferKeepAlive", () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE, amount: "0.5" });
  const { call, params } = constructTransferCall(intent, api);
  assert.strictEqual(params.value, "50000000000000");
  assert.strictEqual(call.value, 50000000000000n);
});

test("constructTransferCall for transferAll passes only 2 args", () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_ALL, amount: "1" });
  const { call, params } = constructTransferCall(intent, api);
  assert.strictEqual(call.__call, "transferAll");
  assert.strictEqual(call.dest, VALID_RECIPIENT);
  assert.strictEqual(call.keepAlive, false);
  assert.strictEqual(params.dest, VALID_RECIPIENT);
  assert.strictEqual(params.keepAlive, false);
});

test("buildExecutionPlan rejects non-validated intent", () => {
  const api = mockApi();
  const intent = baseIntent({ status: INTENT_STATUS.DRAFT });
  assert.throws(() => buildExecutionPlan(intent, api), /validated/);
});

test("buildExecutionPlan rejects missing api", () => {
  const intent = baseIntent();
  assert.throws(() => buildExecutionPlan(intent, null), /ApiPromise/);
});