/**
 * ChainRelay — Intent Definition and Validation
 *
 * Structured intent representation for Portaldot execution.
 * No natural-language parsing. No iBridge dependency.
 */

const { decodeAddress } = require("@polkadot/keyring");
const { toBaseUnits } = require("./amount");

// Supported actions
const SUPPORTED_ACTIONS = Object.freeze({
  TRANSFER: "transfer",
  TRANSFER_KEEP_ALIVE: "transferKeepAlive",
  TRANSFER_ALL: "transferAll",
});

// Supported assets
const SUPPORTED_ASSETS = Object.freeze({
  POT: "POT",
});

// Intent status
const INTENT_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  VALIDATED: "VALIDATED",
  REJECTED: "REJECTED",
  PLANNED: "PLANNED",
  SIGNED: "SIGNED",
  SUBMITTED: "SUBMITTED",
  IN_BLOCK: "IN_BLOCK",
  FINALIZED: "FINALIZED",
  FAILED: "FAILED",
  VERIFIED: "VERIFIED",
});

/**
 * Generate a unique intent ID.
 */
function generateIntentId() {
  const { randomAsHex } = require("@polkadot/util-crypto");
  return "cr_" + randomAsHex(16).substring(2);
}

/**
 * Validate a structured intent.
 *
 * @param {object} intent
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateIntent(intent) {
  const errors = [];

  // Required fields
  if (!intent.action) {
    errors.push("Missing required field: action");
  } else if (!Object.values(SUPPORTED_ACTIONS).includes(intent.action)) {
    errors.push(
      `Unsupported action: ${intent.action}. Supported: ${Object.values(
        SUPPORTED_ACTIONS
      ).join(", ")}`
    );
  }

  if (!intent.asset) {
    errors.push("Missing required field: asset");
  } else if (!Object.values(SUPPORTED_ASSETS).includes(intent.asset)) {
    errors.push(
      `Unsupported asset: ${intent.asset}. Supported: ${Object.values(
        SUPPORTED_ASSETS
      ).join(", ")}`
    );
  }

  // Amount validation — exact BigInt, no Number()
  if (intent.amount === undefined || intent.amount === null) {
    errors.push("Missing required field: amount");
  } else {
    try {
      const baseUnits = toBaseUnits(intent.amount, 14);
      if (baseUnits <= 0n) {
        errors.push("Amount must be greater than zero");
      }
    } catch (err) {
      errors.push(`Invalid amount: ${err.message}`);
    }
  }

  // Recipient validation — real SS58 checksum
  if (!intent.recipient) {
    errors.push("Missing required field: recipient");
  } else if (typeof intent.recipient !== "string") {
    errors.push("Recipient must be a string");
  } else if (!isValidSS58(intent.recipient)) {
    errors.push(`Invalid SS58 address: ${intent.recipient}`);
  }

  // Signer validation — required, must be valid SS58
  if (!intent.signer) {
    errors.push("Missing required field: signer");
  } else if (typeof intent.signer !== "string") {
    errors.push("Signer must be a string");
  } else if (!isValidSS58(intent.signer)) {
    errors.push(`Invalid SS58 address: ${intent.signer}`);
  }

  if (intent.deadline) {
    const now = Date.now();
    if (intent.deadline <= now) {
      errors.push("Intent has expired (deadline must be in the future)");
    }
  }

  if (intent.intentId && typeof intent.intentId !== "string") {
    errors.push("intentId must be a string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate SS58 address using the official Polkadot keyring utility.
 * Verifies the actual SS58 checksum by attempting to decode the address.
 */
function isValidSS58(address) {
  if (typeof address !== "string") return false;
  try {
    decodeAddress(address);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Create a structured intent with validation.
 */
function createIntent(params) {
  const intent = {
    intentId: params.intentId || generateIntentId(),
    action: params.action,
    asset: params.asset,
    amount: params.amount,
    recipient: params.recipient,
    deadline: params.deadline || null,
    signer: params.signer || null,
    status: INTENT_STATUS.DRAFT,
    createdAt: Date.now(),
  };

  const validation = validateIntent(intent);

  if (validation.valid) {
    intent.status = INTENT_STATUS.VALIDATED;
  } else {
    intent.status = INTENT_STATUS.REJECTED;
    intent.validationErrors = validation.errors;
  }

  return intent;
}

module.exports = {
  SUPPORTED_ACTIONS,
  SUPPORTED_ASSETS,
  INTENT_STATUS,
  generateIntentId,
  validateIntent,
  isValidSS58,
  createIntent,
};