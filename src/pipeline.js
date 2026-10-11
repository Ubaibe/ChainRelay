/**
 * ChainRelay — Integrated Execution Pipeline
 *
 * Orchestrates: validate intent → construct call → estimate fee →
 * simulate → create receipt.
 *
 * Read-only. Never signs, submits, or broadcasts a transaction.
 */

const {
  validateIntent,
} = require("./intent");
const {
  constructTransferCall,
  estimateCallFee,
  dryRunCall,
  inspectAccounts,
} = require("./executor");
const {
  createExecutionReceipt,
} = require("./receipt");
const {
  connect,
  disconnect,
} = require("./chain");
const {
  runPreflightChecks,
} = require("./preflight");

/**
 * Run the read-only execution pipeline.
 *
 * @param {object} options
 * @param {object} options.intent - already-created intent object
 * @param {object} [options.api] - optional existing connected ApiPromise
 * @param {object} [options.deps] - optional dependency overrides for testing
 * @returns {object} structured pipeline result
 */
async function runExecutionPipeline({ intent, api, deps } = {}) {
  if (!intent) {
    throw new Error("Intent is required");
  }

  const d = deps || {
    validateIntent,
    constructTransferCall,
    estimateCallFee,
    dryRunCall,
    inspectAccounts,
    createExecutionReceipt,
    connect,
    disconnect,
    runPreflightChecks,
  };

  let ownApi = false;
  let pipelineApi = api;
  let result;

  try {
    // Step 1 — Validate the intent
    const validation = d.validateIntent(intent);
    if (!validation.valid) {
      result = {
        ok: false,
        stage: "VALIDATION",
        intentId: intent.intentId || null,
        receipt: null,
        errors: validation.errors,
      };
      return result;
    }

    // Step 2 — Connect if needed
    if (!pipelineApi) {
      try {
        pipelineApi = await d.connect();
        ownApi = true;
      } catch (err) {
        result = failResult(intent, "CONNECT", err);
        return result;
      }
    }

    // Step 3 — Construct the call
    let callDescription;
    try {
      callDescription = d.constructTransferCall(intent, pipelineApi);
    } catch (err) {
      result = failResult(intent, "CALL_CONSTRUCTION", err);
      return result;
    }

    // Step 4 — Estimate the fee
    let feeEstimate;
    try {
      feeEstimate = await d.estimateCallFee(
        callDescription.call,
        intent.signer,
        pipelineApi
      );
    } catch (err) {
      result = failResult(intent, "FEE_ESTIMATION", err);
      return result;
    }

    // Step 4b — Run preflight checks
    let preflightResult;
    let accounts;
    try {
      // Fetch accounts once for preflight to avoid duplicate queries
      accounts = await d.inspectAccounts(intent, pipelineApi);
      preflightResult = await d.runPreflightChecks({ intent, feeEstimate, accounts }, pipelineApi);
    } catch (err) {
      result = failResult(intent, "PREFLIGHT", err);
      return result;
    }
    if (!preflightResult.ok) {
      result = {
        ok: false,
        stage: "PREFLIGHT",
        intentId: intent.intentId || null,
        receipt: null,
        errors: preflightResult.errors,
        preflight: { checks: preflightResult.checks, warnings: preflightResult.warnings },
      };
      return result;
    }

    // Step 5 — Simulate
    let dryRunResult;
    try {
      dryRunResult = await d.dryRunCall(
        callDescription.call,
        intent.signer,
        pipelineApi
      );
    } catch (err) {
      result = failResult(intent, "SIMULATION", err, { checks: preflightResult.checks, warnings: preflightResult.warnings });
      return result;
    }

    // Step 6 — Create the receipt
    let receipt;
    try {
      receipt = d.createExecutionReceipt({
        intent,
        callDescription: {
          action: callDescription.action,
          pallet: callDescription.pallet,
          method: callDescription.method,
          recipient: callDescription.recipient,
          amount: callDescription.amount,
          keepAlive: callDescription.keepAlive,
        },
        feeEstimate,
        dryRunResult,
        preflight: { checks: preflightResult.checks, warnings: preflightResult.warnings },
      });
    } catch (err) {
      result = failResult(intent, "RECEIPT", err, { checks: preflightResult.checks, warnings: preflightResult.warnings });
      return result;
    }

    const ok = receipt.executionStatus === "SIMULATION_PASSED";
    result = {
      ok,
      stage: receipt.executionStatus,
      intentId: receipt.intentId,
      receipt,
      preflight: { checks: preflightResult.checks, warnings: preflightResult.warnings },
      errors: ok ? [] : ["Simulation did not pass"],
    };
    return result;
  } finally {
    if (ownApi && d.disconnect) {
      try {
        await d.disconnect(pipelineApi);
      } catch (err) {
        // A disconnect failure must not mask the real pipeline result.
        if (result) {
          result.cleanupError = err.message || String(err);
          if (result.ok) {
            result.ok = false;
            result.errors = [...(result.errors || []), `Cleanup failed: ${err.message || String(err)}`];
          }
        }
        // If result is null (should not happen), rethrow so the caller sees it.
        if (!result) {
          throw err;
        }
      }
    }
  }
}

function failResult(intent, stage, err, preflight) {
  const result = {
    ok: false,
    stage,
    intentId: intent.intentId || null,
    receipt: null,
    errors: [err.message || String(err)],
  };
  if (preflight) {
    result.preflight = preflight;
  }
  return result;
}

module.exports = {
  runExecutionPipeline,
};