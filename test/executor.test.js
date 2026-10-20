const { test } = require("node:test");
const assert = require("node:assert/strict");

const { estimateCallFee, dryRunCall } = require("../src/executor");

function makeMockApi({ hasPaymentInfoMethod = false, queryInfoResult, dryRunResult } = {}) {
  const calls = {
    paymentInfo: [],
    queryInfo: [],
    dryRun: [],
    getFinalizedHead: 0,
  };

  const blockHash = {
    toHex: () => "0xabc123",
  };

  const api = {
    rpc: {
      chain: {
        getFinalizedHead: async () => {
          calls.getFinalizedHead += 1;
          return blockHash;
        },
      },
      payment: {
        queryInfo: undefined,
      },
      system: {
        dryRun: undefined,
      },
    },
  };

  if (queryInfoResult !== undefined) {
    api.rpc.payment.queryInfo = async (extrinsicHex, at) => {
      calls.queryInfo.push({ extrinsicHex, at });
      return queryInfoResult;
    };
  }
  if (dryRunResult !== undefined) {
    api.rpc.system.dryRun = async (extrinsicHex, at) => {
      calls.dryRun.push({ extrinsicHex, at });
      return dryRunResult;
    };
  }

  api._calls = calls;
  return api;
}

test("estimateCallFee prefers call.paymentInfo() when available", async () => {
  const api = makeMockApi();
  const call = {
    paymentInfo: async (signer) => {
      assert.strictEqual(signer, "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
      return {
        partialFee: { toString: () => "12345" },
        weight: { toString: () => "1000" },
        class: { toString: () => "Normal" },
        paysFee: { toString: () => "Yes" },
      };
    },
    toHex: () => "0xdeadbeef",
  };

  const res = await estimateCallFee(call, "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", api);
  assert.strictEqual(res.method, "paymentInfo");
  assert.strictEqual(res.partialFee, "12345");
  assert.strictEqual(res.weight, "1000");
  assert.strictEqual(res.class, "Normal");
  assert.strictEqual(res.paysFee, "Yes");
  assert.strictEqual(res.isEstimate, true);
  assert.strictEqual(api._calls.queryInfo.length, 0);
});

test("estimateCallFee falls back to rpc.payment.queryInfo with extrinsic bytes and finalized block hash", async () => {
  const api = makeMockApi({
    queryInfoResult: {
      partialFee: { toString: () => "999" },
      weight: { toString: () => "2000" },
      class: { toString: () => "Normal" },
      paysFee: { toString: () => "Yes" },
    },
  });
  const call = {
    paymentInfo: undefined,
    toHex: () => "0xfeedcafe",
  };

  const res = await estimateCallFee(call, "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", api);
  assert.strictEqual(res.method, "rpc.payment.queryInfo");
  assert.strictEqual(res.partialFee, "999");
  assert.strictEqual(res.weight, "2000");
  assert.strictEqual(api._calls.getFinalizedHead, 1);
  assert.strictEqual(api._calls.queryInfo.length, 1);
  assert.strictEqual(api._calls.queryInfo[0].extrinsicHex, "0xfeedcafe");
  assert.ok(api._calls.queryInfo[0].at);
});

test("estimateCallFee errors when neither fee-estimation path is available", async () => {
  const api = makeMockApi();
  api.rpc.payment.queryInfo = undefined;
  const call = { toHex: () => "0x1234" };
  await assert.rejects(
    estimateCallFee(call, "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", api),
    /Fee estimation unavailable/
  );
});

test("dryRunCall passes extrinsic bytes and finalized block hash", async () => {
  const api = makeMockApi({
    dryRunResult: { toHuman: () => ({ Ok: { Ok: true } }) },
  });
  const call = { toHex: () => "0xbeef" };
  const res = await dryRunCall(call, "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", api);
  assert.strictEqual(res.rpcOk, true);
  assert.strictEqual(res.dispatchOk, true);
  assert.strictEqual(res.method, "rpc.system.dryRun");
  assert.strictEqual(api._calls.getFinalizedHead >= 1, true);
  assert.strictEqual(api._calls.dryRun.length, 1);
  assert.strictEqual(api._calls.dryRun[0].extrinsicHex, "0xbeef");
  assert.ok(api._calls.dryRun[0].at);
});

test("BadOrigin from dryRun is represented as dispatch failure (unsigned simulation limitation)", async () => {
  const api = makeMockApi();
  api.rpc.system.dryRun = async () => ({ toHuman: () => ({ Ok: { Err: "BadOrigin" } }) });
  const call = { toHex: () => "0xdead" };
  const res = await dryRunCall(call, "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", api);
  assert.strictEqual(res.rpcOk, true);
  assert.strictEqual(res.dispatchOk, false);
  assert.strictEqual(res.dispatchError, "BadOrigin");
});
