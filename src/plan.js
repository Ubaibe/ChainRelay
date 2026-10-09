/**
 * ChainRelay — Execution Plan
 *
 * Converts a validated intent into an explicit, inspectable execution plan.
 * No iBridge dependency. Portaldot native pallets only.
 */

const { SUPPORTED_ACTIONS, INTENT_STATUS } = require("./intent");
const { toBaseUnits } = require("./amount");

/**
 * Build an execution plan from a validated intent.
 *
 * @param {object} intent — validated intent
 * @param {object} api — @polkadot/api ApiPromise instance
 * @returns {object} ExecutionPlan
 */
function buildExecutionPlan(intent, api) {
  if (!intent || intent.status !== "VALIDATED") {
    throw new Error("Intent must be validated before planning");
  }

  if (!api) {
    throw new Error("ApiPromise instance required");
  }

  const steps = [];

  // Step 1 — Verify recipient exists on chain
  steps.push({
    step: 1,
    name: "verify_recipient",
    description: "Query recipient account existence on Portaldot",
    pallet: "system",
    query: "account",
    params: [intent.recipient],
    type: "read",
  });

  // Step 2 — Verify sender balance
  steps.push({
    step: 2,
    name: "verify_sender_balance",
    description: "Query sender balance before transfer",
    pallet: "balances",
    query: "account",
    params: [intent.signer],
    type: "read",
  });

  // Step 3 — Construct the extrinsic
  const txCall = constructTransferCall(intent, api);
  steps.push({
    step: 3,
    name: "construct_extrinsic",
    description: `Construct ${intent.action} extrinsic`,
    pallet: "balances",
    method: intent.action,
    params: txCall.params,
    call: txCall.call,
    type: "construct",
  });

  // Step 4 — Estimate fee
  steps.push({
    step: 4,
    name: "estimate_fee",
    description: "Query payment info for fee estimation",
    pallet: "transactionPayment",
    method: "queryInfo",
    params: [txCall.call, intent.signer],
    type: "read",
  });

  // Step 5 — Dry-run
  steps.push({
    step: 5,
    name: "dry_run",
    description: "Dry-run the extrinsic before submission",
    pallet: "system",
    method: "dryRun",
    params: [txCall.call, intent.signer],
    type: "read",
  });

  // Step 6 — Sign and submit
  steps.push({
    step: 6,
    name: "sign_and_submit",
    description: "Sign extrinsic with signer and submit to node",
    type: "sign_submit",
  });

  // Step 7 — Wait for inclusion
  steps.push({
    step: 7,
    name: "wait_inclusion",
    description: "Wait for extrinsic to be included in a block",
    type: "wait",
  });

  // Step 8 — Decode events
  steps.push({
    step: 8,
    name: "decode_events",
    description: "Decode triggered events (ExtrinsicSuccess, balances.Transfer)",
    events: ["system.ExtrinsicSuccess", "system.ExtrinsicFailed", "balances.Transfer"],
    type: "decode",
  });

  // Step 9 — Verify state
  steps.push({
    step: 9,
    name: "verify_state",
    description: "Verify recipient balance delta matches transfer amount",
    pallet: "balances",
    query: "account",
    params: [intent.recipient],
    type: "verify",
  });

  const plan = {
    intentId: intent.intentId,
    action: intent.action,
    asset: intent.asset,
    amount: intent.amount,
    recipient: intent.recipient,
    signer: intent.signer,
    steps,
    createdAt: Date.now(),
    status: "PLANNED",
  };

  return plan;
}

/**
 * Construct the appropriate balances extrinsic call.
 * Amount is converted exactly via toBaseUnits — never through Number().
 */
function constructTransferCall(intent, api) {
  const amountBN = toBaseUnits(intent.amount, 14);

  switch (intent.action) {
    case SUPPORTED_ACTIONS.TRANSFER:
      return {
        call: api.tx.balances.transfer(intent.recipient, amountBN),
        params: {
          dest: intent.recipient,
          value: amountBN.toString(),
        },
      };

    case SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE:
      return {
        call: api.tx.balances.transferKeepAlive(intent.recipient, amountBN),
        params: {
          dest: intent.recipient,
          value: amountBN.toString(),
        },
      };

    case SUPPORTED_ACTIONS.TRANSFER_ALL:
      // Runtime metadata confirms exactly 2 args: (dest, keepAlive)
      return {
        call: api.tx.balances.transferAll(intent.recipient, false),
        params: {
          dest: intent.recipient,
          keepAlive: false,
        },
      };

    default:
      throw new Error(`Unsupported action: ${intent.action}`);
  }
}

/**
 * Validate the plan structure.
 */
function validatePlan(plan) {
  const errors = [];

  if (!plan.steps || !Array.isArray(plan.steps)) {
    errors.push("Plan must have a steps array");
  }

  if (plan.steps && plan.steps.length < 9) {
    errors.push(`Plan has insufficient steps: ${plan.steps.length}, expected at least 9`);
  }

  const requiredSteps = [
    "verify_recipient",
    "verify_sender_balance",
    "construct_extrinsic",
    "estimate_fee",
    "dry_run",
    "sign_and_submit",
    "wait_inclusion",
    "decode_events",
    "verify_state",
  ];

  for (const name of requiredSteps) {
    if (!plan.steps.some((s) => s.name === name)) {
      errors.push(`Missing step: ${name}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  buildExecutionPlan,
  constructTransferCall,
  validatePlan,
};