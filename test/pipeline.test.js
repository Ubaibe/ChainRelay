const { test } = require("node:test");
const assert = require("node:assert/strict");

const { runExecutionPipeline } = require("../src/pipeline");
const { runPreflightChecks } = require("../src/preflight");

const VALID_INTENT = {
  intentId: "cr_pipeline_001",
  action: "transferKeepAlive",
  asset: "POT",
  amount: "1",
  recipient: "5H728gx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  signer: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
  createdAt: 1700000000000,
};

const MOCK_ACCOUNTS = {
  signer: {
    address: "5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
    free: "200000000000000",
    reserved: "0",
    miscFrozen: "0",
    feeFrozen: "0",
  },
  recipient: {
    address: "5H728gx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq",
    free: "10000000000000",
    reserved: "0",
    miscFrozen: "0",
    feeFrozen: "0",
  },
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

const PASSED_PREFLIGHT = {
  ok: true,
  checks: {
    recipient: { exists: true, inconclusive: false },
    senderBalance: { spendability: "SUFFICIENT" },
  },
  errors: [],
  warnings: ["partialFee is an estimate; actual fee may differ (tip, weight changes, etc.)"],
};

const INSUFFICIENT_PREFLIGHT = {
  ok: false,
  checks: {
    senderBalance: { spendability: "INSUFFICIENT", available: "100000", required: "200000", feeOnly: false },
  },
  errors: ["Insufficient balance: available 100000, required 200000 (amount + fee)"],
  warnings: [],
};

const INCONCLUSIVE_PREFLIGHT = {
  ok: true,
  checks: {
    recipient: { exists: null, inconclusive: true, reason: "zero-balance account" },
    senderBalance: { spendability: "UNKNOWN" },
  },
  errors: [],
  warnings: ["Recipient check inconclusive: zero-balance account", "Spendability unknown: could not determine if balance is sufficient"],
};

const INVALID_FEE_PREFLIGHT = {
  ok: false,
  checks: {},
  errors: ["Invalid partialFee: Fee must be a non-negative integer string"],
  warnings: [],
};

function makeDeps(overrides = {}) {
  const validateIntent = overrides.validateIntent || (() => ({ valid: true, errors: [] }));
  const constructTransferCall = overrides.constructTransferCall || (() => MOCK_CALL);
  const estimateCallFee = overrides.estimateCallFee || (async () => MOCK_FEE);
  const inspectAccounts = overrides.inspectAccounts || (async () => MOCK_ACCOUNTS);
  const runPreflightChecks = overrides.runPreflightChecks || (async () => PASSED_PREFLIGHT);
  const dryRunCall = overrides.dryRunCall || (async () => PASSED_DRY);
  const createExecutionReceipt = overrides.createExecutionReceipt || require("../src/receipt").createExecutionReceipt;
  const connect = overrides.connect || (async () => ({}));
  const disconnect = overrides.disconnect || (async () => {});
  return { validateIntent, constructTransferCall, estimateCallFee, inspectAccounts, runPreflightChecks, dryRunCall, createExecutionReceipt, connect, disconnect };
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
  assert.ok(result.preflight);
  assert.ok(result.preflight.checks);
});

test("BadOrigin returns ok false and preserves simulation failure", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ dryRunCall: async () => FAILED_DRY }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_FAILED");
  assert.strictEqual(result.receipt.simulation.dispatchError, "BadOrigin");
  assert.ok(result.preflight);
});

test("dispatchOk false returns ok false", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ dryRunCall: async () => ({ ...PASSED_DRY, dispatchOk: false }) }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_FAILED");
  assert.ok(result.preflight);
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
  assert.ok(result.preflight);
});

test("receipt creation errors are reported at RECEIPT", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ createExecutionReceipt: () => { throw new Error("receipt fail"); } }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "RECEIPT");
  assert.ok(result.errors.includes("receipt fail"));
  assert.ok(result.preflight);
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

// --- Preflight integration tests ---

test("preflight passes and simulation is reached", async () => {
  let simulationReached = false;
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      dryRunCall: async () => { simulationReached = true; return PASSED_DRY; },
    }),
  });
  assert.strictEqual(simulationReached, true);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_PASSED");
  assert.ok(result.preflight);
  assert.ok(result.preflight.checks.recipient);
  assert.ok(result.preflight.checks.senderBalance);
});

test("definite insufficient balance stops at PREFLIGHT", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ runPreflightChecks: async () => INSUFFICIENT_PREFLIGHT }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "PREFLIGHT");
  assert.ok(result.errors.some((e) => e.includes("Insufficient balance")));
  assert.ok(result.preflight);
  assert.strictEqual(result.preflight.checks.senderBalance.spendability, "INSUFFICIENT");
});

test("inconclusive preflight continues with warnings", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ runPreflightChecks: async () => INCONCLUSIVE_PREFLIGHT }),
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_PASSED");
  assert.ok(result.preflight);
  assert.ok(result.preflight.warnings.some((w) => w.includes("inconclusive")));
  assert.ok(result.preflight.warnings.some((w) => w.includes("unknown")));
});

test("malformed fee evidence is rejected at preflight", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ runPreflightChecks: async () => INVALID_FEE_PREFLIGHT }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "PREFLIGHT");
  assert.ok(result.errors.some((e) => e.includes("Invalid partialFee")));
  assert.ok(result.preflight);
});

test("fee-estimation failure prevents preflight", async () => {
  let preflightCalled = false;
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      estimateCallFee: async () => { throw new Error("fee fail"); },
      runPreflightChecks: async () => { preflightCalled = true; return PASSED_PREFLIGHT; },
    }),
  });
  assert.strictEqual(result.stage, "FEE_ESTIMATION");
  assert.strictEqual(preflightCalled, false);
  assert.ok(!result.preflight); // preflight never ran
});

test("BadOrigin remains SIMULATION_FAILED after preflight passes", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ dryRunCall: async () => FAILED_DRY }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.receipt.executionStatus, "SIMULATION_FAILED");
  assert.strictEqual(result.receipt.simulation.dispatchError, "BadOrigin");
  assert.ok(result.preflight);
  // Preflight warnings should be in receipt limitations
  assert.ok(result.receipt.limitations.some((l) => l.includes("BadOrigin")));
});

test("preflight exception produces structured failure at PREFLIGHT", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({ runPreflightChecks: async () => { throw new Error("preflight boom"); } }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "PREFLIGHT");
  assert.ok(result.errors.includes("preflight boom"));
});

test("disconnect failure preserves earlier failure and preflight evidence", async () => {
  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      disconnect: async () => { throw new Error("disconnect failed"); },
      runPreflightChecks: async () => INCONCLUSIVE_PREFLIGHT,
      dryRunCall: async () => { throw new Error("dry fail"); },
    }),
  });
  assert.strictEqual(result.stage, "SIMULATION");
  assert.ok(result.errors.includes("dry fail"));
  assert.strictEqual(result.cleanupError, "disconnect failed");
  assert.ok(result.preflight);
  assert.ok(result.preflight.warnings.some((w) => w.includes("inconclusive")));
});

test("receipt contains serializable preflight checks and warnings", async () => {
  const result = await runExecutionPipeline({ intent: VALID_INTENT, deps: makeDeps() });
  const serialized = JSON.stringify(result.receipt);
  const parsed = JSON.parse(serialized);
  assert.ok(parsed.preflight);
  assert.ok(parsed.preflight.checks);
  assert.ok(parsed.preflight.warnings);
  assert.ok(Array.isArray(parsed.preflight.warnings));
  assert.ok(parsed.limitations.some((l) => l.startsWith("Preflight:")));
});

test("malformed pre-fetched signer account stops at PREFLIGHT with structured evidence", async () => {
  let simulationReached = false;
  let disconnectCalled = false;

  const MALFORMED_ACCOUNTS = {
    signer: {
      address: VALID_INTENT.signer,
      free: "abc", // malformed: not a valid integer string
      reserved: "0",
      miscFrozen: "0",
      feeFrozen: "0",
    },
    recipient: {
      address: VALID_INTENT.recipient,
      free: "10000000000000",
      reserved: "0",
      miscFrozen: "0",
      feeFrozen: "0",
    },
  };

  const result = await runExecutionPipeline({
    intent: VALID_INTENT,
    deps: makeDeps({
      inspectAccounts: async () => MALFORMED_ACCOUNTS,
      runPreflightChecks, // use real implementation to validate malformed accounts
      dryRunCall: async () => { simulationReached = true; return PASSED_DRY; },
      disconnect: async () => { disconnectCalled = true; },
    }),
  });

  // Pipeline should stop at PREFLIGHT
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "PREFLIGHT");
  assert.strictEqual(result.receipt, null);

  // Should have structured preflight evidence with validation error
  assert.ok(result.preflight);
  assert.ok(result.preflight.checks);
  assert.ok(result.preflight.checks.senderBalance);
  assert.strictEqual(result.preflight.checks.senderBalance.spendability, "UNKNOWN");
  assert.ok(result.preflight.checks.senderBalance.error?.includes("signer account field free must be a non-negative integer string"));

  // Errors should contain the validation error
  assert.ok(result.errors.some((e) => e.includes("signer account field free must be a non-negative integer string")));

  // Simulation should NOT be reached
  assert.strictEqual(simulationReached, false);

  // Cleanup should still be called (internally created API)
  assert.strictEqual(disconnectCalled, true);

  // Result should not have cleanupError since preflight failure is the primary error
  // (disconnect is called but doesn't fail in this test)
  assert.strictEqual(result.cleanupError, undefined);
});