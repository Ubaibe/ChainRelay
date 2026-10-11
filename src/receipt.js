/**
 * ChainRelay — Execution Receipt
 *
 * Builds a JSON-serializable execution receipt from an intent and
 * read-only execution results. Does NOT submit or verify any transaction.
 */

const RECEIPT_VERSION = "1.0.0";

/**
 * Build a conservative execution receipt.
 *
 * @param {object} params
 * @param {object} params.intent - ChainRelay intent
 * @param {object} [params.callDescription] - serializable call description from constructTransferCall
 * @param {object} [params.feeEstimate] - serializable fee estimate from estimateCallFee
 * @param {object} [params.dryRunResult] - serializable dry-run result from dryRunCall
 * @param {object} [params.preflight] - optional preflight checks { checks, warnings }
 * @returns {object} JSON-serializable receipt
 */
function createExecutionReceipt({ intent, callDescription, feeEstimate, dryRunResult, preflight }) {
  if (!intent) {
    throw new Error("Intent is required");
  }

  const limitations = [];

  // Determine execution status
  let executionStatus = "PLANNED";
  const evidence = [];

  if (callDescription) {
    evidence.push({
      type: "call_constructed",
      timestamp: Date.now(),
      detail: `${callDescription.pallet}.${callDescription.method} constructed`,
    });
  }

  if (feeEstimate) {
    executionStatus = "FEE_ESTIMATED";
    evidence.push({
      type: "fee_estimated",
      timestamp: Date.now(),
      method: feeEstimate.method || "unknown",
      partialFee: feeEstimate.partialFee || null,
    });
  }

  if (dryRunResult) {
    if (dryRunResult.dispatchOk === true) {
      executionStatus = "SIMULATION_PASSED";
      evidence.push({
        type: "simulation_passed",
        timestamp: Date.now(),
        method: dryRunResult.method || "unknown",
        blockHash: dryRunResult.blockHash || null,
      });
    } else if (dryRunResult.rpcOk === false) {
      executionStatus = "SIMULATION_FAILED";
      evidence.push({
        type: "simulation_failed",
        timestamp: Date.now(),
        reason: dryRunResult.error || "RPC failure",
      });
    } else if (dryRunResult.dispatchError) {
      executionStatus = "SIMULATION_FAILED";
      evidence.push({
        type: "simulation_failed",
        timestamp: Date.now(),
        dispatchError: dryRunResult.dispatchError,
        note: "Dry-run RPC succeeded but simulated dispatch was rejected by the runtime",
      });
    } else {
      executionStatus = "SIMULATION_FAILED";
      evidence.push({
        type: "simulation_inconclusive",
        timestamp: Date.now(),
        raw: dryRunResult.raw || null,
      });
    }
  }

  // Conservative limitations
  limitations.push(
    "Dry-run simulation is not an on-chain transaction and does not guarantee execution will succeed"
  );

  if (dryRunResult && dryRunResult.dispatchError === "BadOrigin") {
    limitations.push(
      "Simulated dispatch returned BadOrigin: the payload was an unsigned extrinsic and the balances pallet requires a signed origin"
    );
  }

  if (dryRunResult && dryRunResult.dispatchOk !== true) {
    limitations.push(
      "This receipt does not confirm any on-chain state change"
    );
  }

  // Preflight evidence
  if (preflight) {
    evidence.push({
      type: "preflight_checks",
      timestamp: Date.now(),
      checks: preflight.checks,
    });
    if (preflight.warnings && preflight.warnings.length > 0) {
      limitations.push(...preflight.warnings.map((w) => `Preflight: ${w}`));
    }
  }

  // Build the receipt
  const receipt = {
    receiptVersion: RECEIPT_VERSION,
    intentId: intent.intentId || null,
    action: intent.action || null,
    asset: intent.asset || null,
    amount: intent.amount || null,
    recipient: intent.recipient || null,
    createdAt: intent.createdAt || null,
    executionStatus,
    call: callDescription ? copyCallDescription(callDescription) : null,
    feeEstimate: feeEstimate ? copyFeeEstimate(feeEstimate) : null,
    simulation: dryRunResult ? copyDryRunResult(dryRunResult) : null,
    preflight: preflight ? { checks: preflight.checks, warnings: preflight.warnings } : null,
    evidence,
    limitations,
  };

  // Verify JSON-serializability
  JSON.stringify(receipt);

  return receipt;
}

function copyCallDescription(desc) {
  return {
    action: desc.action || null,
    pallet: desc.pallet || null,
    method: desc.method || null,
    recipient: desc.recipient || null,
    amount: typeof desc.amount === "string" ? desc.amount : (desc.amount !== undefined ? String(desc.amount) : null),
    keepAlive: typeof desc.keepAlive === "boolean" ? desc.keepAlive : null,
  };
}

function copyFeeEstimate(fee) {
  return {
    signerAddress: fee.signerAddress || null,
    partialFee: typeof fee.partialFee === "string" ? fee.partialFee : null,
    weight: typeof fee.weight === "string" ? fee.weight : null,
    class: fee.class || null,
    paysFee: fee.paysFee || null,
    isEstimate: true,
    method: fee.method || null,
  };
}

function copyDryRunResult(dry) {
  return {
    signerAddress: dry.signerAddress || null,
    blockHash: dry.blockHash || null,
    rpcOk: dry.rpcOk || false,
    dispatchOk: dry.dispatchOk || false,
    dispatchError: dry.dispatchError || null,
    dispatchResult: dry.dispatchResult || null,
    error: dry.error || null,
    isEstimate: true,
    method: dry.method || null,
  };
}

module.exports = {
  createExecutionReceipt,
  RECEIPT_VERSION,
};