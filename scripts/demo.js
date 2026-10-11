#!/usr/bin/env node
/**
 * ChainRelay — Offline Demo
 *
 * Demonstrates the execution pipeline with deterministic mocked dependencies.
 * No network access. No signing. No transaction submission.
 */

const { runExecutionPipeline } = require("../src/pipeline");
const { createIntent, SUPPORTED_ACTIONS } = require("../src/intent");
const { Keyring } = require("@polkadot/keyring");

const keyring = new Keyring({ type: "sr25519" });
const VALID_SIGNER = keyring.addFromSeed(new Uint8Array(32)).address;
const VALID_RECIPIENT = keyring.addFromSeed(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])).address;

function createMockApi() {
  const mockBlockHash = {
    toHex: () => "0xabcdef1234567890",
  };
  return {
    query: {
      system: {
        account: async (address) => ({
          data: {
            free: 500000000000000n,
            reserved: 0n,
            miscFrozen: 0n,
            feeFrozen: 0n,
          },
        }),
      },
    },
    rpc: {
      chain: {
        getFinalizedHead: async () => mockBlockHash,
      },
      payment: {
        queryInfo: async () => ({
          partialFee: 1470125203481n,
          weight: 179881000n,
          class: "Normal",
          paysFee: null,
        }),
      },
      system: {
        dryRun: async () => ({ Ok: { Ok: "0x0" } }),
      },
    },
    tx: {
      balances: {
        transfer: (dest, value) => ({
          __mock: true,
          method: "transfer",
          dest,
          value,
          toHex: () => "0xmockedextrinsic",
          paymentInfo: async () => ({
            partialFee: 1470125203481n,
            weight: 179881000n,
            class: "Normal",
            paysFee: null,
          }),
        }),
        transferKeepAlive: (dest, value) => ({
          __mock: true,
          method: "transferKeepAlive",
          dest,
          value,
          toHex: () => "0xmockedextrinsic",
          paymentInfo: async () => ({
            partialFee: 1470125203481n,
            weight: 179881000n,
            class: "Normal",
            paysFee: null,
          }),
        }),
        transferAll: (dest, keepAlive) => ({
          __mock: true,
          method: "transferAll",
          dest,
          keepAlive,
          toHex: () => "0xmockedextrinsic",
          paymentInfo: async () => ({
            partialFee: 1470125203481n,
            weight: 179881000n,
            class: "Normal",
            paysFee: null,
          }),
        }),
      },
    },
  };
}

function createMockApiWithBadOrigin() {
  const api = createMockApi();
  api.rpc.system.dryRun = async () => ({
    Ok: { Err: "BadOrigin" },
  });
  return api;
}

function createMockApiWithRpcFailure() {
  const api = createMockApi();
  api.rpc.system.dryRun = async () => ({
    Err: "RPC error: some error",
  });
  return api;
}

function createMockApiWithBadOrigin() {
  const api = createMockApi();
  api.rpc.system.dryRun = async () => ({
    Ok: { Err: "BadOrigin" },
  });
  return api;
}

function createMockApiWithRpcFailure() {
  const api = createMockApi();
  api.rpc.system.dryRun = async () => ({
    Err: "RPC error: some error",
  });
  return api;
}

async function runScenarioA() {
  console.log("\n" + "=".repeat(70));
  console.log("SCENARIO A: Controlled Simulation Success (Mocked)");
  console.log("=".repeat(70));

  const intent = createIntent({
    action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE,
    asset: "POT",
    amount: "1.5",
    recipient: VALID_RECIPIENT,
    signer: VALID_SIGNER,
    deadline: Date.now() + 60000,
  });

  console.log("\nIntent:");
  console.log(`  ID: ${intent.intentId}`);
  console.log(`  Action: ${intent.action}`);
  console.log(`  Asset: ${intent.asset}`);
  console.log(`  Amount: ${intent.amount} ${intent.asset} (14 decimals)`);
  console.log(`  Recipient: ${intent.recipient}`);
  console.log(`  Signer: ${intent.signer}`);

  const mockApi = createMockApi();

  const result = await runExecutionPipeline({
    intent,
    api: mockApi,
  });

  console.log("\nPipeline Result:");
  console.log(`  OK: ${result.ok}`);
  console.log(`  Stage: ${result.stage}`);

  if (result.receipt) {
    const r = result.receipt;
    console.log("\nReceipt:");
    console.log(`  Version: ${r.receiptVersion}`);
    console.log(`  Execution Status: ${r.executionStatus}`);
    console.log(`  Intent ID: ${r.intentId}`);
    console.log(`  Action: ${r.action}`);
    console.log(`  Asset: ${r.asset}`);
    console.log(`  Amount: ${r.amount} ${r.asset}`);
    console.log(`  Call: ${r.call?.pallet}.${r.call?.method} (amount: ${r.call?.amount})`);

    if (r.feeEstimate) {
      console.log(`\n  Fee Estimate (ESTIMATE ONLY):`);
      console.log(`    Partial Fee: ${r.feeEstimate.partialFee} base units`);
      console.log(`    Weight: ${r.feeEstimate.weight}`);
      console.log(`    Class: ${r.feeEstimate.class}`);
      console.log(`    Method: ${r.feeEstimate.method}`);
      console.log(`    ⚠️  This is an estimate; actual fee may differ (tip, weight changes, etc.)`);
    }

    if (r.simulation) {
      console.log(`\n  Simulation:`);
      console.log(`    RPC OK: ${r.simulation.rpcOk}`);
      console.log(`    Dispatch OK: ${r.simulation.dispatchOk}`);
      if (r.simulation.dispatchError) {
        console.log(`    Dispatch Error: ${r.simulation.dispatchError}`);
      }
      console.log(`    Block Hash: ${r.simulation.blockHash}`);
    }

    if (r.preflight) {
      console.log(`\n  Preflight:`);
      console.log(`    Recipient: ${r.preflight.checks.recipient?.exists ? "Exists" : (r.preflight.checks.recipient?.inconclusive ? "Inconclusive (zero-balance)" : "Not found")}`);
      console.log(`    Sender Balance: ${r.preflight.checks.senderBalance?.spendability}`);
      console.log(`    Fee Only: ${r.preflight.checks.senderBalance?.feeOnly}`);
      if (r.preflight.warnings && r.preflight.warnings.length > 0) {
        console.log(`    Warnings:`);
        r.preflight.warnings.forEach(w => console.log(`      - ${w}`));
      }
    }

    console.log(`\n  Limitations:`);
    r.limitations.forEach(l => console.log(`    - ${l}`));
  }

  if (result.errors && result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log("\n" + "-".repeat(70));
  console.log("⚠️  THIS IS A MOCKED DEMONSTRATION — NO TRANSACTION WAS SIGNED OR SUBMITTED");
  console.log("-".repeat(70) + "\n");

  return result;
}

async function runScenarioB() {
  console.log("\n" + "=".repeat(70));
  console.log("SCENARIO B: Portaldot-style BadOrigin Failure (Mocked)");
  console.log("=".repeat(70));

  const intent = createIntent({
    action: SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE,
    asset: "POT",
    amount: "1.5",
    recipient: VALID_RECIPIENT,
    signer: VALID_SIGNER,
    deadline: Date.now() + 60000,
  });

  console.log("\nIntent:");
  console.log(`  ID: ${intent.intentId}`);
  console.log(`  Action: ${intent.action}`);
  console.log(`  Asset: ${intent.asset}`);
  console.log(`  Amount: ${intent.amount} ${intent.asset} (14 decimals)`);
  console.log(`  Recipient: ${intent.recipient}`);
  console.log(`  Signer: ${intent.signer}`);

  const mockApi = createMockApiWithBadOrigin();

  const result = await runExecutionPipeline({
    intent,
    api: mockApi,
  });

  console.log("\nPipeline Result:");
  console.log(`  OK: ${result.ok}`);
  console.log(`  Stage: ${result.stage}`);

  if (result.receipt) {
    const r = result.receipt;
    console.log("\nReceipt:");
    console.log(`  Version: ${r.receiptVersion}`);
    console.log(`  Execution Status: ${r.executionStatus}`);
    console.log(`  Intent ID: ${r.intentId}`);
    console.log(`  Action: ${r.action}`);
    console.log(`  Asset: ${r.asset}`);
    console.log(`  Amount: ${r.amount} ${r.asset}`);

    if (r.feeEstimate) {
      console.log(`\n  Fee Estimate (ESTIMATE ONLY):`);
      console.log(`    Partial Fee: ${r.feeEstimate.partialFee} base units`);
      console.log(`    Weight: ${r.feeEstimate.weight}`);
      console.log(`    Class: ${r.feeEstimate.class}`);
      console.log(`    Method: ${r.feeEstimate.method}`);
      console.log(`    ⚠️  This is an estimate; actual fee may differ (tip, weight changes, etc.)`);
    }

    if (r.simulation) {
      console.log(`\n  Simulation:`);
      console.log(`    RPC OK: ${r.simulation.rpcOk}`);
      console.log(`    Dispatch OK: ${r.simulation.dispatchOk}`);
      if (r.simulation.dispatchError) {
        console.log(`    Dispatch Error: ${r.simulation.dispatchError}`);
      }
      console.log(`    Block Hash: ${r.simulation.blockHash}`);
    }

    if (r.preflight) {
      console.log(`\n  Preflight:`);
      console.log(`    Recipient: ${r.preflight.checks.recipient?.exists ? "Exists" : (r.preflight.checks.recipient?.inconclusive ? "Inconclusive (zero-balance)" : "Not found")}`);
      console.log(`    Sender Balance: ${r.preflight.checks.senderBalance?.spendability}`);
      console.log(`    Fee Only: ${r.preflight.checks.senderBalance?.feeOnly}`);
      if (r.preflight.warnings && r.preflight.warnings.length > 0) {
        console.log(`    Warnings:`);
        r.preflight.warnings.forEach(w => console.log(`      - ${w}`));
      }
    }

    console.log(`\n  Limitations:`);
    r.limitations.forEach(l => console.log(`    - ${l}`));
  }

  if (result.errors && result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log("\n" + "-".repeat(70));
  console.log("⚠️  THIS IS A MOCKED DEMONSTRATION — NO TRANSACTION WAS SIGNED OR SUBMITTED");
  console.log("⚠️  BadOrigin is expected for unsigned dry-run; balances pallet requires signed origin");
  console.log("-".repeat(70) + "\n");

  return result;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║                    ChainRelay Offline Demo                          ║");
  console.log("║         Read-only execution pipeline for Portaldot                ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  await runScenarioA();
  await runScenarioB();

  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  Demo complete. Both scenarios executed with mocked dependencies.  ║");
  console.log("║  No network access. No signing. No transaction submission.         ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
}

main().catch(err => {
  console.error("Demo failed:", err);
  process.exit(1);
});