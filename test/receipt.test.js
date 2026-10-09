const { test } = require("node:test");
const assert = require("node:assert/strict");

const { createExecutionReceipt } = require("../src/receipt");

const VALID_INTENT = {
  intentId: "cr_test001",
  action: "transferKeepAlive",
  asset: "POT",
  amount: "1",
  recipient: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  createdAt: 1700000000000,
};

const VALID_CALL = {
  action: "transferKeepAlive",
  pallet: "balances",
  method: "transferKeepAlive",
  recipient: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  amount: "100000000000000",
  keepAlive: null,
};

const VALID_FEE = {
  signerAddress: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  partialFee: "1470125203481",
  weight: "179881000",
  class: "Normal",
  paysFee: null,
  isEstimate: true,
  method: "paymentInfo",
};

const BAD_ORIGIN_DRY = {
  signerAddress: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  blockHash: "0xf3c6677914a34892857e4ba141055dae923a87c12ad8116e47717b62db197413",
  rpcOk: true,
  dispatchOk: false,
  dispatchError: "BadOrigin",
  isEstimate: true,
  method: "rpc.system.dryRun",
};

test("valid intent without fee or dry-run produces PLANNED", () => {
  const receipt = createExecutionReceipt({ intent: VALID_INTENT });
  assert.strictEqual(receipt.executionStatus, "PLANNED");
});

test("adding a fee estimate produces FEE_ESTIMATED", () => {
  const receipt = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: VALID_CALL,
    feeEstimate: VALID_FEE,
  });
  assert.strictEqual(receipt.executionStatus, "FEE_ESTIMATED");
});

test("dry-run with rpcOk true and dispatchOk false produces SIMULATION_FAILED", () => {
  const receipt = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: VALID_CALL,
    feeEstimate: VALID_FEE,
    dryRunResult: BAD_ORIGIN_DRY,
  });
  assert.strictEqual(receipt.executionStatus, "SIMULATION_FAILED");
});

test("BadOrigin dispatch error is preserved in the receipt", () => {
  const receipt = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: VALID_CALL,
    feeEstimate: VALID_FEE,
    dryRunResult: BAD_ORIGIN_DRY,
  });
  assert.strictEqual(receipt.simulation.dispatchError, "BadOrigin");
  assert.ok(receipt.limitations.some((l) => l.includes("BadOrigin")));
});

test("only explicit dispatchOk true produces SIMULATION_PASSED", () => {
  const passed = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: VALID_CALL,
    feeEstimate: VALID_FEE,
    dryRunResult: {
      ...BAD_ORIGIN_DRY,
      dispatchOk: true,
      dispatchError: null,
    },
  });
  assert.strictEqual(passed.executionStatus, "SIMULATION_PASSED");
});

test("successful RPC without explicit dispatch success does not produce SIMULATION_PASSED", () => {
  const inconclusive = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: VALID_CALL,
    feeEstimate: VALID_FEE,
    dryRunResult: {
      signerAddress: VALID_FEE.signerAddress,
      blockHash: "0xabc",
      rpcOk: true,
      dispatchOk: false,
      isEstimate: true,
      method: "rpc.system.dryRun",
    },
  });
  assert.notStrictEqual(inconclusive.executionStatus, "SIMULATION_PASSED");
});

test("amount and partialFee remain strings", () => {
  const receipt = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: VALID_CALL,
    feeEstimate: VALID_FEE,
    dryRunResult: BAD_ORIGIN_DRY,
  });
  assert.strictEqual(typeof receipt.amount, "string");
  assert.strictEqual(typeof receipt.feeEstimate.partialFee, "string");
});

test("receipt survives JSON.stringify then JSON.parse round trip", () => {
  const receipt = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: VALID_CALL,
    feeEstimate: VALID_FEE,
    dryRunResult: BAD_ORIGIN_DRY,
  });
  const restored = JSON.parse(JSON.stringify(receipt));
  assert.deepStrictEqual(restored, receipt);
  assert.strictEqual(restored.executionStatus, "SIMULATION_FAILED");
});

test("live extrinsic object supplied to input is not leaked into serialized receipt", () => {
  const fakeExtrinsic = {
    toHex: () => "0xdeadbeef",
    paymentInfo: async () => ({}),
    __live: true,
  };
  const receipt = createExecutionReceipt({
    intent: VALID_INTENT,
    callDescription: {
      ...VALID_CALL,
      call: fakeExtrinsic,
    },
    feeEstimate: {
      ...VALID_FEE,
      call: fakeExtrinsic,
    },
    dryRunResult: {
      ...BAD_ORIGIN_DRY,
      call: fakeExtrinsic,
    },
  });
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes("deadbeef"));
  assert.ok(!serialized.includes("__live"));
});

test("missing intent is rejected", () => {
  assert.throws(() => createExecutionReceipt({}), /Intent is required/);
});

test("null intent is rejected", () => {
  assert.throws(() => createExecutionReceipt({ intent: null }), /Intent is required/);
});