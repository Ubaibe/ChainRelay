const { test } = require("node:test");
const assert = require("node:assert");

const {
  checkAccountExists,
  checkBalanceSufficiency,
  runPreflightChecks,
  SPENDABILITY,
  validateFeeString,
} = require("../src/preflight");
const { toBaseUnits } = require("../src/amount");
const { SUPPORTED_ACTIONS, INTENT_STATUS } = require("../src/intent");
const { Keyring } = require("@polkadot/keyring");

const keyring = new Keyring({ type: "sr25519" });
const VALID_SIGNER = keyring.addFromSeed(new Uint8Array(32)).address;
const VALID_RECIPIENT = keyring.addFromSeed(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])).address;

// Mock api that returns a stub for system.account query
function mockApi(overrides = {}) {
  const defaultAccount = {
    data: {
      free: 100000000000000n,
      reserved: 0n,
      miscFrozen: 0n,
      feeFrozen: 0n,
    },
  };

  return {
    query: {
      system: {
        account: async (address) => {
          if (overrides.accounts && overrides.accounts[address]) {
            const acc = overrides.accounts[address];
            return {
              data: {
                free: BigInt(acc.free || 0),
                reserved: BigInt(acc.reserved || 0),
                miscFrozen: BigInt(acc.miscFrozen || 0),
                feeFrozen: BigInt(acc.feeFrozen || 0),
              },
            };
          }
          return defaultAccount;
        },
      },
    },
  };
}

function baseIntent(overrides = {}) {
  return {
    intentId: "cr_test123",
    action: SUPPORTED_ACTIONS.TRANSFER,
    asset: "POT",
    amount: "1.5",
    recipient: VALID_RECIPIENT,
    signer: VALID_SIGNER,
    deadline: Date.now() + 60000,
    status: INTENT_STATUS.VALIDATED,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateFeeString tests
// ---------------------------------------------------------------------------

test("validateFeeString accepts valid non-negative integer string", () => {
  const result = validateFeeString("10000000000000");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.feeBN, 10000000000000n);
  assert.strictEqual(result.error, null);
});

test("validateFeeString accepts zero", () => {
  const result = validateFeeString("0");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.feeBN, 0n);
});

test("validateFeeString rejects negative string", () => {
  const result = validateFeeString("-100");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("negative"));
});

test("validateFeeString rejects empty string", () => {
  const result = validateFeeString("");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("empty"));
});

test("validateFeeString rejects non-numeric string", () => {
  const result = validateFeeString("abc");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("integer"));
});

test("validateFeeString rejects non-string type", () => {
  const result = validateFeeString(123);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("string"));
});

// ---------------------------------------------------------------------------
// checkAccountExists tests
// ---------------------------------------------------------------------------

test("checkAccountExists returns exists=true for funded account", async () => {
  const api = mockApi();
  const result = await checkAccountExists(VALID_SIGNER, api);
  assert.strictEqual(result.exists, true);
  assert.strictEqual(result.inconclusive, false);
  assert.ok(result.account);
  assert.strictEqual(result.account.address, VALID_SIGNER);
  assert.strictEqual(result.account.free, "100000000000000");
});

test("checkAccountExists returns inconclusive for zero-balance account", async () => {
  const api = mockApi({
    accounts: {
      [VALID_RECIPIENT]: { free: "0", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const result = await checkAccountExists(VALID_RECIPIENT, api);
  assert.strictEqual(result.exists, null);
  assert.strictEqual(result.inconclusive, true);
  assert.strictEqual(result.account, null);
  assert.ok(result.reason.includes("zero-balance"));
});

test("checkAccountExists throws on invalid address", async () => {
  const api = mockApi();
  await assert.rejects(
    () => checkAccountExists("not-an-address", api),
    /Invalid SS58/
  );
});

test("checkAccountExists throws on missing api", async () => {
  await assert.rejects(
    () => checkAccountExists(VALID_SIGNER, null),
    /ApiPromise/
  );
});

// ---------------------------------------------------------------------------
// checkBalanceSufficiency tests
// ---------------------------------------------------------------------------

test("checkBalanceSufficiency returns spendability=SUFFICIENT when balance covers amount+fee", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1.5",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER);
  assert.strictEqual(result.spendability, SPENDABILITY.SUFFICIENT);
  assert.strictEqual(result.required, "160000000000000");
  assert.strictEqual(result.available, "200000000000000");
  assert.strictEqual(result.feeOnly, false);
});

test("checkBalanceSufficiency returns spendability=INSUFFICIENT when balance insufficient", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "100000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1.5",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER);
  assert.strictEqual(result.spendability, SPENDABILITY.INSUFFICIENT);
  assert.strictEqual(result.required, "160000000000000");
  assert.strictEqual(result.available, "100000000000000");
  assert.strictEqual(result.feeOnly, false);
});

test("checkBalanceSufficiency accounts for frozen balances", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: {
        free: "200000000000000",
        reserved: "0",
        miscFrozen: "50000000000000",
        feeFrozen: "0",
      },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1.5",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER);
  // available = 200000000000000 - 50000000000000 = 150000000000000
  // required = 150000000000000 + 10000000000000 = 160000000000000
  assert.strictEqual(result.available, "150000000000000");
  assert.strictEqual(result.spendability, SPENDABILITY.INSUFFICIENT);
  assert.ok(result.warnings.some((w) => w.includes("Frozen balances")));
});

test("checkBalanceSufficiency throws on invalid sender", async () => {
  const api = mockApi();
  await assert.rejects(
    () => checkBalanceSufficiency({ sender: "invalid", amount: "1", fee: "1000" }, api, SUPPORTED_ACTIONS.TRANSFER),
    /Invalid SS58/
  );
});

test("checkBalanceSufficiency throws on missing amount for fixed transfer", async () => {
  const api = mockApi();
  await assert.rejects(
    () => checkBalanceSufficiency({ sender: VALID_SIGNER, amount: "", fee: "1000" }, api, SUPPORTED_ACTIONS.TRANSFER),
    /Amount is required/
  );
});

test("checkBalanceSufficiency throws on invalid fee string", async () => {
  const api = mockApi();
  await assert.rejects(
    () => checkBalanceSufficiency({ sender: VALID_SIGNER, amount: "1", fee: "" }, api, SUPPORTED_ACTIONS.TRANSFER),
    /Invalid fee: Fee must not be empty/
  );
});

test("checkBalanceSufficiency throws on negative fee string", async () => {
  const api = mockApi();
  await assert.rejects(
    () => checkBalanceSufficiency({ sender: VALID_SIGNER, amount: "1", fee: "-100" }, api, SUPPORTED_ACTIONS.TRANSFER),
    /Invalid fee: Fee must not be negative/
  );
});

test("checkBalanceSufficiency throws on non-numeric fee string", async () => {
  const api = mockApi();
  await assert.rejects(
    () => checkBalanceSufficiency({ sender: VALID_SIGNER, amount: "1", fee: "abc" }, api, SUPPORTED_ACTIONS.TRANSFER),
    /Invalid fee: Fee must be a non-negative integer string/
  );
});

test("checkBalanceSufficiency TRANSFER_ALL only validates fee affordability", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "100000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "999999", // placeholder, should be ignored
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER_ALL);
  assert.strictEqual(result.feeOnly, true);
  assert.strictEqual(result.required, "10000000000000");
  assert.strictEqual(result.spendability, SPENDABILITY.SUFFICIENT);
  assert.ok(result.warnings.some((w) => w.includes("TRANSFER_ALL")));
});

test("checkBalanceSufficiency TRANSFER_ALL returns INSUFFICIENT when fee unaffordable", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "5000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER_ALL);
  assert.strictEqual(result.feeOnly, true);
  assert.strictEqual(result.spendability, SPENDABILITY.INSUFFICIENT);
});

test("checkBalanceSufficiency includes reserved balance warning", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "10000000000000", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1.5",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER);
  assert.ok(result.warnings.some((w) => w.includes("Reserved balance")));
});

test("checkBalanceSufficiency includes feeFrozen warning", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "5000000000000" },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1.5",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER);
  assert.ok(result.warnings.some((w) => w.includes("Frozen balances")));
});

test("checkBalanceSufficiency returns serializable result", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const result = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1.5",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER);
  JSON.stringify(result);
});

// ---------------------------------------------------------------------------
// runPreflightChecks tests
// ---------------------------------------------------------------------------

test("runPreflightChecks returns ok=true when all checks pass", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "10000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate }, api);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
  assert.ok(result.checks.recipient);
  assert.ok(result.checks.senderBalance);
  assert.ok(Array.isArray(result.warnings));
});

test("runPreflightChecks returns ok=true with warning for zero-balance recipient (inconclusive)", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "0", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate }, api);
  // Zero-balance recipient is inconclusive, not an error
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("inconclusive")));
  assert.strictEqual(result.checks.recipient.exists, null);
  assert.strictEqual(result.checks.recipient.inconclusive, true);
});

test("runPreflightChecks returns ok=false when sender balance insufficient", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "100000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "10000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("Insufficient balance")));
});

test("runPreflightChecks throws on missing intent", async () => {
  const api = mockApi();
  await assert.rejects(
    () => runPreflightChecks({ intent: null, feeEstimate: { partialFee: "1000" } }, api),
    /Intent is required/
  );
});

test("runPreflightChecks throws on missing feeEstimate", async () => {
  const api = mockApi();
  const intent = baseIntent();
  await assert.rejects(
    () => runPreflightChecks({ intent, feeEstimate: null }, api),
    /Fee estimate with partialFee is required/
  );
});

test("runPreflightChecks throws on missing api", async () => {
  const intent = baseIntent();
  const feeEstimate = { partialFee: "10000000000000" };
  await assert.rejects(
    () => runPreflightChecks({ intent, feeEstimate }, null),
    /ApiPromise instance is required/
  );
});

test("runPreflightChecks returns ok=false when feeEstimate.partialFee is invalid", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "10000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "invalid", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("Invalid partialFee")));
});

test("runPreflightChecks includes warnings for partialFee estimate", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "10000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate }, api);
  assert.ok(result.warnings.some((w) => w.includes("partialFee is an estimate")));
});

test("runPreflightChecks includes check details in result even on failure", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "100000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "0", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate }, api);
  assert.ok(result.checks.recipient);
  assert.strictEqual(result.checks.recipient.exists, null);
  assert.strictEqual(result.checks.recipient.inconclusive, true);
  assert.ok(result.checks.senderBalance);
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.INSUFFICIENT);
});

test("runPreflightChecks TRANSFER_ALL intent only checks fee affordability", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "100000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "10000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_ALL, amount: "ignored" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate }, api);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.checks.senderBalance.feeOnly, true);
  assert.ok(result.warnings.some((w) => w.includes("TRANSFER_ALL")));
});

test("checkAccountExists and checkBalanceSufficiency return serializable results", async () => {
  const api = mockApi({
    accounts: {
      [VALID_SIGNER]: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
      [VALID_RECIPIENT]: { free: "10000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
    },
  });

  const accResult = await checkAccountExists(VALID_RECIPIENT, api);
  const balResult = await checkBalanceSufficiency({
    sender: VALID_SIGNER,
    amount: "1.5",
    fee: "10000000000000",
  }, api, SUPPORTED_ACTIONS.TRANSFER);

  // Should be JSON-serializable
  JSON.stringify(accResult);
  JSON.stringify(balResult);
});

// ---------------------------------------------------------------------------
// validateAccountSnapshot tests
// ---------------------------------------------------------------------------

test("validateAccountSnapshot accepts valid account with all required fields", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const account = {
    free: "100000000000000",
    reserved: "0",
    miscFrozen: "0",
    feeFrozen: "0",
    address: VALID_SIGNER,
  };
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, true);
  assert.ok(result.data);
  assert.strictEqual(result.data.free, 100000000000000n);
  assert.strictEqual(result.data.reserved, 0n);
  assert.strictEqual(result.data.miscFrozen, 0n);
  assert.strictEqual(result.data.feeFrozen, 0n);
  assert.strictEqual(result.data.address, VALID_SIGNER);
  assert.strictEqual(result.error, null);
});

test("validateAccountSnapshot rejects missing account object", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const result = validateAccountSnapshot(null, "signer");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("missing or not an object"));
});

test("validateAccountSnapshot rejects missing required field", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const account = { free: "100", reserved: "0", miscFrozen: "0" }; // missing feeFrozen
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("missing required field: feeFrozen"));
});

test("validateAccountSnapshot rejects non-string field value", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const account = { free: "100", reserved: 0, miscFrozen: "0", feeFrozen: "0" };
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("must be a string"));
});

test("validateAccountSnapshot rejects empty string field", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const account = { free: "100", reserved: "0", miscFrozen: "", feeFrozen: "0" };
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("must not be empty"));
});

test("validateAccountSnapshot rejects negative field value", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const account = { free: "100", reserved: "0", miscFrozen: "-10", feeFrozen: "0" };
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("must not be negative"));
});

test("validateAccountSnapshot rejects malformed integer string", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const account = { free: "100", reserved: "0", miscFrozen: "abc", feeFrozen: "0" };
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes("must be a non-negative integer string"));
});

test("validateAccountSnapshot handles large integers beyond safe integer range", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const largeValue = "999999999999999999999999999999";
  const account = { free: largeValue, reserved: "0", miscFrozen: "0", feeFrozen: "0" };
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.free, BigInt(largeValue));
});

test("validateAccountSnapshot treats address as optional", () => {
  const { validateAccountSnapshot } = require("../src/preflight");
  const account = { free: "100", reserved: "0", miscFrozen: "0", feeFrozen: "0" };
  const result = validateAccountSnapshot(account, "signer");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.address, null);
});

// ---------------------------------------------------------------------------
// runPreflightChecks with pre-fetched accounts - malformed data tests
// ---------------------------------------------------------------------------

test("runPreflightChecks returns structured error when accounts.signer is missing", async () => {
  const { runPreflightChecks, SPENDABILITY } = require("../src/preflight");
  const api = mockApi();
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({ intent, feeEstimate, accounts: { recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } } }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("signer account snapshot is missing")));
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.UNKNOWN);
  assert.ok(result.checks.senderBalance.error?.includes("signer account snapshot is missing"));
});

test("runPreflightChecks returns structured error when accounts.signer.free is missing", async () => {
  const { runPreflightChecks, SPENDABILITY } = require("../src/preflight");
  const api = mockApi();
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { reserved: "0", miscFrozen: "0", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("signer account missing required field: free")));
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.UNKNOWN);
});

test("runPreflightChecks returns structured error when accounts.signer.free is invalid string", async () => {
  const { runPreflightChecks, SPENDABILITY } = require("../src/preflight");
  const api = mockApi();
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "abc", reserved: "0", miscFrozen: "0", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("signer account field free must be a non-negative integer string")));
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.UNKNOWN);
});

test("runPreflightChecks returns structured error when accounts.signer.free is negative", async () => {
  const { runPreflightChecks, SPENDABILITY } = require("../src/preflight");
  const api = mockApi();
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "-100", reserved: "0", miscFrozen: "0", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("signer account field free must not be negative")));
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.UNKNOWN);
});

test("runPreflightChecks returns structured error when frozen/reserved fields missing or malformed", async () => {
  const { runPreflightChecks, SPENDABILITY } = require("../src/preflight");
  const api = mockApi();
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "100000000000000", reserved: "0", miscFrozen: "invalid", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("signer account field miscFrozen must be a non-negative integer string")));
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.UNKNOWN);
});

test("runPreflightChecks returns structured error when recipient snapshot is malformed and recipient data is required", async () => {
  const { runPreflightChecks, SPENDABILITY } = require("../src/preflight");
  const api = mockApi();
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" }, recipient: { free: "not-a-number", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("recipient account field free must be a non-negative integer string")));
  assert.strictEqual(result.checks.recipient.inconclusive, true);
  assert.ok(result.checks.recipient.error?.includes("recipient account field free must be a non-negative integer string"));
});

test("runPreflightChecks handles valid large integer balances exceeding JavaScript safe integer range", async () => {
  const { runPreflightChecks, SPENDABILITY } = require("../src/preflight");
  const api = mockApi();
  const intent = baseIntent({ amount: "1.5" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  // Large balance well beyond Number.MAX_SAFE_INTEGER
  const largeFree = "9007199254740993000000000"; // > 2^53
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: largeFree, reserved: "0", miscFrozen: "0", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.SUFFICIENT);
  assert.strictEqual(result.checks.senderBalance.senderBalance.free, largeFree);
});

// ---------------------------------------------------------------------------
// runPreflightChecks with pre-fetched accounts - TRANSFER_ALL tests
// ---------------------------------------------------------------------------

test("runPreflightChecks TRANSFER_ALL with pre-fetched accounts and sufficient fee balance", async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_ALL, amount: "ignored" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  // Sufficient fee balance: free=200000000000000, fee=10000000000000
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "200000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.checks.senderBalance.feeOnly, true);
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.SUFFICIENT);
  assert.strictEqual(result.checks.senderBalance.required, "10000000000000");
  assert.ok(result.warnings.some((w) => w.includes("TRANSFER_ALL")));
});

test("runPreflightChecks TRANSFER_ALL with pre-fetched accounts and insufficient fee balance", async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_ALL, amount: "ignored" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  // Insufficient fee balance: free=5000000000000, fee=10000000000000
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "5000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.checks.senderBalance.feeOnly, true);
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.INSUFFICIENT);
  assert.ok(result.errors.some((e) => e.includes("Insufficient balance")));
  assert.ok(result.errors.some((e) => e.includes("fee only")));
});

test("runPreflightChecks TRANSFER_ALL with pre-fetched accounts accounts for frozen balances", async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_ALL, amount: "ignored" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  // free=200000000000000, miscFrozen=50000000000000, fee=10000000000000
  // available = 200000000000000 - 50000000000000 = 150000000000000 >= fee
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "200000000000000", reserved: "0", miscFrozen: "50000000000000", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.checks.senderBalance.feeOnly, true);
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.SUFFICIENT);
  assert.strictEqual(result.checks.senderBalance.senderBalance.availableForFees, "150000000000000");
  assert.ok(result.warnings.some((w) => w.includes("Frozen balances")));
});

test("runPreflightChecks TRANSFER_ALL with pre-fetched accounts fails when frozen exceeds available", async () => {
  const api = mockApi();
  const intent = baseIntent({ action: SUPPORTED_ACTIONS.TRANSFER_ALL, amount: "ignored" });
  const feeEstimate = { partialFee: "10000000000000", method: "paymentInfo" };

  // free=10000000000000, miscFrozen=50000000000000, fee=10000000000000
  // available = 10000000000000 - 50000000000000 = -40000000000000 (negative, insufficient)
  const result = await runPreflightChecks({
    intent,
    feeEstimate,
    accounts: { signer: { free: "10000000000000", reserved: "0", miscFrozen: "50000000000000", feeFrozen: "0" }, recipient: { free: "1000", reserved: "0", miscFrozen: "0", feeFrozen: "0" } },
  }, api);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.checks.senderBalance.feeOnly, true);
  assert.strictEqual(result.checks.senderBalance.spendability, SPENDABILITY.INSUFFICIENT);
  assert.ok(result.errors.some((e) => e.includes("Insufficient balance")));
});