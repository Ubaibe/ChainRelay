const { test } = require("node:test");
const assert = require("node:assert/strict");

const { runExecutionPipeline } = require("../src/pipeline");

const VALID_INTENT = {
  intentId: "cr_pipeline_001",
  action: "transferKeepAlive",
  asset: "POT",
  amount: "1",
  recipient: "5H728gx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  createdAt: 1700000000000,
};

const MOCK_CALL = {
  action: "transferKeepAlive",
  pallet: "balances",
  method: "transferKeepAlive",
  recipient: VALID_INTENT.recipient,
  amount: "100000000000000",
  keepAlive: null,
  call: { __live: true, toHex: () => "0xdeadbeef" },
};

const MOCK_FEE = {
  signerAddress: VALID_INTENT.signer,
  partialFee: "1470125203481",
  weight: "179881000",
  class: "Normal",
  paysFee: null,
  isEstimate: true,
  method: "paymentInfo",
};

const PASSED_DRY = {
  signerAddress: VALID_INTENT.signer,
  blockHash: "0xabc",
  rpcOk: true,
  dispatchOk: true,
  dispatchResult: "Ok",
  isEstimate: true,
  method: "rpc.system.dryRun",
};

const FAILED_DRY = {
  signerAddress: VALID_INTENT.signer,
  blockHash: "0xabc",
  rpcOk: true,
  dispatchOk: false,
  dispatchError: "BadOrigin",
  isEstimate: true,
  method: "rpc.system.dryRun",
};

function makeDeps(overrides = {}) {
  const validateIntent = overrides.validateIntent || (() => ({ valid: true, errors: [] }));
  const constructTransferCall = overrides.constructTransferCall || (() => MOCK_CALL);
  const estimateCallFee = overrides.estimateCallFee || (async () => MOCK_FEE);
  const dryRunCall = overrides.dryRunCall || (async () => PASSED_DRY);
  const createExecutionReceipt = overrides.createExecutionReceipt || require("../src/receipt").createExecutionReceipt;
  const connect = overrides.connect || (async () => ({}));
  const disconnect = overrides.disconnect || (async () => {});
  return { validateIntent, constructTransferCall, estimateCallFee, dryRunCall, createExecutionReceipt, connect, disconnect };
}

test("missing intent throws", async () => {
  await assert.rejects(runExecutionPipeline({}), /Intent is required/);
});

test("invalid intent returns validation failure without connecting", async () => {
  let connected = false;
  const deps = makeDeps({
    validateIntent: () => ({ valid: false, errors: ["bad amount"] }),
    connect: async () => { connected = true; return {}; },
  });
  const result = await runExecutionPipeline({ intent: { ...VALID_INTENT, amount: "0" }, deps });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "VALIDATION");
  assert.strictEqual(result.receipt, null);
  assert.ok(result.errors.includes("bad amount"));
  assert.strictEqual(connected, false);
});

test("successful simulated receipt returns ok true", async () => {
  const result = await runExecutionPipeline({ intent: VALID_INTENT, deps: makeDeps() });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_PASSED");
});

test("BadOrigin returns ok false and preserves simulation failure", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ dryRunCall: async () => FAILED_DRY }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_FAILED");
  assert.strictEqual(result.receipt.simulation.dispatchError, "BadOrigin");
});

test("dispatchOk false returns ok false", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ dryRunCall: async () => ({ ...PASSED_DRY, dispatchOk: false }) }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_FAILED");
});

test("call-construction errors are reported at CALL_CONSTRUCTION", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ constructTransferCall: () => { throw new Error("boom"); } }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "CALL_CONSTRUCTION");
  assert.ok(result.errors.includes("boom"));
});

test("fee-estimation errors are reported at FEE_ESTIMATION", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ estimateCallFee: async () => { throw new Error("fee fail"); } }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "FEE_ESTIMATION");
  assert.ok(result.errors.includes("fee fail"));
});

test("simulation exceptions are reported at SIMULATION", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ dryRunCall: async () => { throw new Error("dry fail"); } }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "SIMULATION");
  assert.ok(result.errors.includes("dry fail"));
});

test("receipt creation errors are reported at RECEIPT", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ createExecutionReceipt: () => { throw new Error("receipt fail"); } }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "RECEIPT");
  assert.ok(result.errors.includes("receipt fail"));
});

test("caller-provided API is not disconnected", async () => {
  let disconnected = false;
  const fakeApi = {};
  await runExecutionPipeline({
    intent: VALID_INTENT,
    api: fakeApi,
    deps: makeDeps({ disconnect: async () => { disconnected = true; } }),
  });
  assert.strictEqual(disconnected, false);
});

test("internally created API is disconnected even when a later step fails", async () => {
  let disconnected = false;
  await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      connect: async () => ({}),
      disconnect: async () => { disconnected = true; },
      estimateCallFee: async () => { throw new Error("fee fail"); },
    }),
  });
  assert.strictEqual(disconnected, true);
});

test("live extrinsic is not included in the receipt call description", async () => {
  const result = await runExecutionPipeline({ intent: VALID_INTENT, deps: makeDeps() });
  const serialized = JSON.stringify(result.receipt);
  assert.ok(!serialized.includes("__live"));
  assert.ok(!serialized.includes("deadbeef"));
  assert.strictEqual(result.receipt.call.method, "transferKeepAlive");
  assert.strictEqual(result.receipt.call.pallet, "balances");
});

test("connection failure is reported at CONNECT", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      connect: async () => { throw new Error("connection refused"); },
    }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "CONNECT");
  assert.ok(result.errors.includes("connection refused"));
  assert.strictEqual(result.receipt, null);
});

test("disconnect failure after a successful run is reported", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      disconnect: async () => { throw new Error("disconnect failed"); },
    }),
  });
  assert.strictEqual(result.cleanupError, "disconnect failed");
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("disconnect failed")));
});

test("disconnect failure does not mask an earlier pipeline failure", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      disconnect: async () => { throw new Error("disconnect failed"); },
      estimateCallFee: async () => { throw new Error("fee fail"); },
    }),
  });
  assert.strictEqual(result.stage, "FEE_ESTIMATION");
  assert.ok(result.errors.includes("fee fail"));
  assert.strictEqual(result.cleanupError, "disconnect failed");
});