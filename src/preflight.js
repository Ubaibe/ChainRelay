/**
 * ChainRelay — Preflight Checks
 *
 * Performs pre-execution checks before the pipeline runs:
 * - Recipient account existence (inconclusive for zero-balance accounts)
 * - Sender balance sufficiency (including estimated fee)
 * - Fee adequacy
 * Read-only. No signing. No submission.
 */

const { toBaseUnits } = require("./amount");
const { isValidSS58, SUPPORTED_ACTIONS } = require("./intent");

const SPENDABILITY = Object.freeze({
  SUFFICIENT: "SUFFICIENT",
  INSUFFICIENT: "INSUFFICIENT",
  UNKNOWN: "UNKNOWN",
});

/**
 * Validate a fee string as a non-negative integer.
 *
 * @param {string} fee - fee string to validate
 * @returns {object} { valid: boolean, feeBN: bigint|null, error: string|null }
 */
function validateFeeString(fee) {
  if (typeof fee !== "string") {
    return { valid: false, feeBN: null, error: "Fee must be a string" };
  }
  const trimmed = fee.trim();
  if (trimmed === "") {
    return { valid: false, feeBN: null, error: "Fee must not be empty" };
  }
  if (trimmed.startsWith("-")) {
    return { valid: false, feeBN: null, error: "Fee must not be negative" };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, feeBN: null, error: "Fee must be a non-negative integer string" };
  }
  try {
    const feeBN = BigInt(trimmed);
    return { valid: true, feeBN, error: null };
  } catch (err) {
    return { valid: false, feeBN: null, error: `Fee parsing failed: ${err.message}` };
  }
}

/**
 * Check if an account exists on chain.
 *
 * Note: system.account returns default zero AccountInfo for non-existent accounts,
 * which is indistinguishable from a genuine zero-balance account. This function
 * returns an inconclusive result when the account data shows zero free and reserved.
 *
 * @param {string} address - SS58 address
 * @param {object} api - @polkadot/api ApiPromise instance
 * @returns {object} { exists: boolean|null, account: object|null, inconclusive: boolean, reason: string|null }
 */
async function checkAccountExists(address, api) {
  if (!address || typeof address !== "string") {
    throw new Error("Address is required");
  }
  if (!isValidSS58(address)) {
    throw new Error(`Invalid SS58 address: ${address}`);
  }
  if (!api || typeof api.query?.system?.account !== "function") {
    throw new Error("Valid ApiPromise instance with system.account query is required");
  }

  const account = await api.query.system.account(address);
  const data = account.data;

  const freeZero = typeof data.free.isZero === "function" ? data.free.isZero() : data.free === 0n;
  const reservedZero = typeof data.reserved.isZero === "function" ? data.reserved.isZero() : data.reserved === 0n;
  const isEmpty = freeZero && reservedZero;

  if (isEmpty) {
    return {
      exists: null,
      account: null,
      inconclusive: true,
      reason: "Account data shows zero free and reserved balance; cannot distinguish nonexistent from zero-balance account via system.account query",
    };
  }

  return {
    exists: true,
    account: {
      address,
      free: data.free.toString(),
      reserved: data.reserved.toString(),
      miscFrozen: data.miscFrozen.toString(),
      feeFrozen: data.feeFrozen.toString(),
    },
    inconclusive: false,
    reason: null,
  };
}

/**
 * Check if sender has sufficient balance for amount + fee.
 *
 * For TRANSFER_ALL, the transfer amount is the entire transferable balance
 * (determined at execution time), so we only validate fee affordability.
 *
 * @param {object} params
 * @param {string} params.sender - signer address
 * @param {string} params.amount - human-readable amount (e.g. "1.5"), ignored for TRANSFER_ALL
 * @param {string} params.fee - fee estimate string (e.g. "123456789")
 * @param {object} api - @polkadot/api ApiPromise instance
 * @param {string} [params.action] - intent action type
 * @returns {object} { spendability: string, senderBalance: object, required: string|null, available: string, feeOnly: boolean, warnings: string[] }
 */
async function checkBalanceSufficiency({ sender, amount, fee }, api, action) {
  if (!sender || typeof sender !== "string") {
    throw new Error("Sender address is required");
  }
  if (!isValidSS58(sender)) {
    throw new Error(`Invalid SS58 sender address: ${sender}`);
  }
  if (!api || typeof api.query?.system?.account !== "function") {
    throw new Error("Valid ApiPromise instance with system.account query is required");
  }

  const feeValidation = validateFeeString(fee);
  if (!feeValidation.valid) {
    throw new Error(`Invalid fee: ${feeValidation.error}`);
  }
  const feeBN = feeValidation.feeBN;

  const account = await api.query.system.account(sender);
  const data = account.data;

  // Available balance for transaction fees = free - miscFrozen - feeFrozen
  // Handle both BN-like objects (with .toString()) and BigInt
  const free = typeof data.free.toString === "function" ? BigInt(data.free.toString()) : data.free;
  const miscFrozen = typeof data.miscFrozen.toString === "function" ? BigInt(data.miscFrozen.toString()) : data.miscFrozen;
  const feeFrozen = typeof data.feeFrozen.toString === "function" ? BigInt(data.feeFrozen.toString()) : data.feeFrozen;

  const availableForFees = free - miscFrozen - feeFrozen;
  const reserved = typeof data.reserved.toString === "function" ? BigInt(data.reserved.toString()) : data.reserved;

  const warnings = [];
  let spendability = SPENDABILITY.UNKNOWN;
  let required = null;
  let feeOnly = false;

  if (action === SUPPORTED_ACTIONS.TRANSFER_ALL) {
    // TRANSFER_ALL transfers the entire transferable balance.
    // We cannot know the transfer amount at preflight time.
    // Only validate that the fee is affordable from available balance.
    feeOnly = true;
    required = feeBN.toString();
    if (availableForFees >= feeBN) {
      spendability = SPENDABILITY.SUFFICIENT;
    } else {
      spendability = SPENDABILITY.INSUFFICIENT;
      warnings.push(`Fee ${feeBN} exceeds available balance for fees ${availableForFees}`);
    }
    warnings.push("TRANSFER_ALL: transfer amount determined at execution; only fee affordability checked");
  } else {
    // Fixed-amount transfers (TRANSFER, TRANSFER_KEEP_ALIVE)
    if (!amount || typeof amount !== "string") {
      throw new Error("Amount is required for fixed-amount transfers");
    }
    const amountBN = toBaseUnits(amount, 14);
    required = (amountBN + feeBN).toString();

    // For fixed transfers, spendable balance = free - miscFrozen - feeFrozen
    // (reserved is not available for transfers)
    const spendable = free - miscFrozen - feeFrozen;
    if (spendable >= amountBN + feeBN) {
      spendability = SPENDABILITY.SUFFICIENT;
    } else {
      spendability = SPENDABILITY.INSUFFICIENT;
      warnings.push(`Required ${amountBN + feeBN} exceeds spendable balance ${spendable}`);
    }

    // Note: This assumes miscFrozen and feeFrozen both reduce transferable balance.
    // Portaldot runtime semantics may differ; this is a conservative estimate.
    if (miscFrozen > 0n || feeFrozen > 0n) {
      warnings.push("Frozen balances (miscFrozen/feeFrozen) reduce spendable balance per conservative estimate; runtime semantics may vary");
    }
    if (reserved > 0n) {
      warnings.push("Reserved balance exists but is excluded from spendable calculation; runtime semantics may vary");
    }
  }

  return {
    spendability,
    senderBalance: {
      address: sender,
      free: data.free.toString(),
      reserved: data.reserved.toString(),
      miscFrozen: data.miscFrozen.toString(),
      feeFrozen: data.feeFrozen.toString(),
      availableForFees: availableForFees.toString(),
    },
    required,
    available: availableForFees.toString(),
    feeOnly,
    warnings,
  };
}

/**
 * Run all preflight checks.
 *
 * @param {object} params
 * @param {object} params.intent - validated intent
 * @param {object} params.feeEstimate - fee estimate from estimateCallFee
 * @param {object} [params.accounts] - optional pre-fetched account data { signer, recipient }
 * @param {object} api - @polkadot/api ApiPromise instance
 * @returns {object} { ok: boolean, checks: object, errors: string[], warnings: string[] }
 */
async function runPreflightChecks({ intent, feeEstimate, accounts }, api) {
  if (!intent) {
    throw new Error("Intent is required");
  }
  if (!feeEstimate || !feeEstimate.partialFee) {
    throw new Error("Fee estimate with partialFee is required");
  }
  if (!api) {
    throw new Error("ApiPromise instance is required");
  }

  const errors = [];
  const warnings = [];
  const checks = {};

  // Check 1: Recipient account status
  try {
    if (accounts?.recipient) {
      // Use pre-fetched data if available
      const validation = validateAccountSnapshot(accounts.recipient, "recipient");
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      const data = validation.data;
      const freeZero = data.free === 0n;
      const reservedZero = data.reserved === 0n;
      const isEmpty = freeZero && reservedZero;

      if (isEmpty) {
        checks.recipient = {
          exists: null,
          account: null,
          inconclusive: true,
          reason: "Account data shows zero free and reserved balance; cannot distinguish nonexistent from zero-balance account via system.account query",
        };
      } else {
        checks.recipient = {
          exists: true,
          account: {
            address: data.address || intent.recipient,
            free: data.free.toString(),
            reserved: data.reserved.toString(),
            miscFrozen: data.miscFrozen.toString(),
            feeFrozen: data.feeFrozen.toString(),
          },
          inconclusive: false,
          reason: null,
        };
      }
    } else {
      checks.recipient = await checkAccountExists(intent.recipient, api);
    }
    if (checks.recipient.inconclusive) {
      warnings.push(`Recipient check inconclusive: ${checks.recipient.reason}`);
    } else if (!checks.recipient.exists) {
      errors.push("Recipient account does not exist on chain");
    }
  } catch (err) {
    errors.push(`Recipient check failed: ${err.message}`);
    checks.recipient = { exists: null, inconclusive: true, error: err.message };
  }

  // Check 2: Sender balance sufficiency
  try {
    if (accounts && !accounts.signer) {
      // accounts object provided but signer missing - this is a validation error
      throw new Error("signer account snapshot is missing");
    }
    if (accounts?.signer) {
      // Use pre-fetched data if available
      const validation = validateAccountSnapshot(accounts.signer, "signer");
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      const data = validation.data;
      const free = data.free;
      const miscFrozen = data.miscFrozen;
      const feeFrozen = data.feeFrozen;
      const reserved = data.reserved;

      const feeValidation = validateFeeString(feeEstimate.partialFee);
      if (!feeValidation.valid) {
        throw new Error(`Invalid fee: ${feeValidation.error}`);
      }
      const feeBN = feeValidation.feeBN;

      const availableForFees = free - miscFrozen - feeFrozen;

      const senderBalance = {
        address: data.address || intent.signer,
        free: data.free.toString(),
        reserved: data.reserved.toString(),
        miscFrozen: data.miscFrozen.toString(),
        feeFrozen: data.feeFrozen.toString(),
        availableForFees: availableForFees.toString(),
      };

      const balanceWarnings = [];
      let spendability = SPENDABILITY.UNKNOWN;
      let required = null;
      let feeOnly = false;

      if (intent.action === SUPPORTED_ACTIONS.TRANSFER_ALL) {
        feeOnly = true;
        required = feeBN.toString();
        if (availableForFees >= feeBN) {
          spendability = SPENDABILITY.SUFFICIENT;
        } else {
          spendability = SPENDABILITY.INSUFFICIENT;
          balanceWarnings.push(`Fee ${feeBN} exceeds available balance for fees ${availableForFees}`);
        }
        balanceWarnings.push("TRANSFER_ALL: transfer amount determined at execution; only fee affordability checked");
        // Frozen balances reduce available balance for fees; warn even for TRANSFER_ALL
        if (miscFrozen > 0n || feeFrozen > 0n) {
          balanceWarnings.push("Frozen balances (miscFrozen/feeFrozen) reduce available balance for fees per conservative estimate; runtime semantics may vary");
        }
        if (reserved > 0n) {
          balanceWarnings.push("Reserved balance exists but is excluded from available balance calculation; runtime semantics may vary");
        }
      } else {
        if (!intent.amount || typeof intent.amount !== "string") {
          throw new Error("Amount is required for fixed-amount transfers");
        }
        const amountBN = toBaseUnits(intent.amount, 14);
        required = (amountBN + feeBN).toString();

        // For fixed transfers, spendable balance = free - miscFrozen - feeFrozen
        // (reserved is not available for transfers)
        const spendable = free - miscFrozen - feeFrozen;
        if (spendable >= amountBN + feeBN) {
          spendability = SPENDABILITY.SUFFICIENT;
        } else {
          spendability = SPENDABILITY.INSUFFICIENT;
          balanceWarnings.push(`Required ${amountBN + feeBN} exceeds spendable balance ${spendable}`);
        }

        // Note: This assumes miscFrozen and feeFrozen both reduce transferable balance.
        // Portaldot runtime semantics may differ; this is a conservative estimate.
        if (miscFrozen > 0n || feeFrozen > 0n) {
          balanceWarnings.push("Frozen balances (miscFrozen/feeFrozen) reduce spendable balance per conservative estimate; runtime semantics may vary");
        }
        if (reserved > 0n) {
          balanceWarnings.push("Reserved balance exists but is excluded from spendable calculation; runtime semantics may vary");
        }
      }

      checks.senderBalance = {
        spendability,
        senderBalance,
        required,
        available: availableForFees.toString(),
        feeOnly,
        warnings: balanceWarnings,
      };
    } else {
      checks.senderBalance = await checkBalanceSufficiency({
        sender: intent.signer,
        amount: intent.amount,
        fee: feeEstimate.partialFee,
      }, api, intent.action);
    }

    if (checks.senderBalance.spendability === SPENDABILITY.INSUFFICIENT) {
      errors.push(
        `Insufficient balance: available ${checks.senderBalance.available}, ` +
        `required ${checks.senderBalance.required} (${checks.senderBalance.feeOnly ? "fee only" : "amount + fee"})`
      );
    } else if (checks.senderBalance.spendability === SPENDABILITY.UNKNOWN) {
      warnings.push("Spendability unknown: could not determine if balance is sufficient");
    }
    if (checks.senderBalance.warnings) {
      warnings.push(...checks.senderBalance.warnings);
    }
  } catch (err) {
    errors.push(`Sender balance check failed: ${err.message}`);
    checks.senderBalance = { spendability: SPENDABILITY.UNKNOWN, error: err.message };
  }

  // Check 3: Fee validation (partialFee is an estimate, not guaranteed final fee)
  const feeValidation = validateFeeString(feeEstimate.partialFee);
  if (!feeValidation.valid) {
    errors.push(`Invalid partialFee: ${feeValidation.error}`);
  } else {
    warnings.push("partialFee is an estimate; actual fee may differ (tip, weight changes, etc.)");
  }

  return {
    ok: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}

/**
 * Validate an account snapshot object from pre-fetched data.
 *
 * Required fields for all calculations:
 * - free: string representing non-negative integer
 * - reserved: string representing non-negative integer
 * - miscFrozen: string representing non-negative integer
 * - feeFrozen: string representing non-negative integer
 *
 * Does not silently default missing/invalid fields to zero.
 * Returns a structured validation result.
 *
 * @param {object} account - account snapshot object
 * @param {string} label - label for error messages (e.g., "signer", "recipient")
 * @returns {object} { valid: boolean, data: object|null, error: string|null }
 */
function validateAccountSnapshot(account, label) {
  if (!account || typeof account !== "object") {
    return { valid: false, data: null, error: `${label} account snapshot is missing or not an object` };
  }

  const requiredFields = ["free", "reserved", "miscFrozen", "feeFrozen"];
  const data = {};

  for (const field of requiredFields) {
    const value = account[field];
    if (value === undefined || value === null) {
      return { valid: false, data: null, error: `${label} account missing required field: ${field}` };
    }
    if (typeof value !== "string") {
      return { valid: false, data: null, error: `${label} account field ${field} must be a string, got ${typeof value}` };
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      return { valid: false, data: null, error: `${label} account field ${field} must not be empty` };
    }
    if (trimmed.startsWith("-")) {
      return { valid: false, data: null, error: `${label} account field ${field} must not be negative` };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, data: null, error: `${label} account field ${field} must be a non-negative integer string` };
    }
    try {
      data[field] = BigInt(trimmed);
    } catch (err) {
      return { valid: false, data: null, error: `${label} account field ${field} parsing failed: ${err.message}` };
    }
  }

  // address is optional in pre-fetched data (will fall back to intent)
  const address = typeof account.address === "string" ? account.address.trim() : null;

  return { valid: true, data: { ...data, address }, error: null };
}

module.exports = {
  checkAccountExists,
  checkBalanceSufficiency,
  runPreflightChecks,
  SPENDABILITY,
  validateFeeString,
  validateAccountSnapshot,
};