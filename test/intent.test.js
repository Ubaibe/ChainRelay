const { test } = require("node:test");
const assert = require("node:assert");

const {
  createIntent,
  validateIntent,
  isValidSS58,
  SUPPORTED_ACTIONS,
  SUPPORTED_ASSETS,
  INTENT_STATUS,
} = require("../src/intent");
const { toBaseUnits } = require("../src/amount");

// Generate a known-valid SS58 address for Portaldot (prefix 42)
const { Keyring } = require("@polkadot/keyring");
const keyring = new Keyring({ type: "sr25519" });
const VALID_SIGNER = keyring.addFromSeed(new Uint8Array(32)).address;
const VALID_RECIPIENT = keyring.addFromSeed(new Uint8Array(32)).address;

function baseIntent(overrides = {}) {
  return {
    action: SUPPORTED_ACTIONS.TRANSFER,
    asset: SUPPORTED_ASSETS.POT,
    amount: "1",
    recipient: VALID_RECIPIENT,
    signer: VALID_SIGNER,
    deadline: Date.now() + 60000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Intent tests
// ---------------------------------------------------------------------------

test("Valid intent passes", () => {
  const result = validateIntent(baseIntent());
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

test("Zero amount is rejected", () => {
  const result = validateIntent(baseIntent({ amount: "0" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Amount")));
});

test("Negative amount is rejected", () => {
  const result = validateIntent(baseIntent({ amount: "-1" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Amount")));
});

test("Malformed amount is rejected", () => {
  const result = validateIntent(baseIntent({ amount: "abc" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes("amount")));
});

test("Scientific notation is rejected", () => {
  const result = validateIntent(baseIntent({ amount: "1e-5" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes("amount")));
});

test("Invalid SS58 recipient is rejected", () => {
  const result = validateIntent(baseIntent({ recipient: "not-a-valid-address" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("recipient") || e.includes("SS58")));
});

test("Invalid SS58 signer is rejected", () => {
  const result = validateIntent(baseIntent({ signer: "not-a-valid-address" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("signer") || e.includes("SS58")));
});

test("Expired deadline is rejected", () => {
  const result = validateIntent(baseIntent({ deadline: Date.now() - 1000 }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("expired")));
});

test("Unsupported action is rejected", () => {
  const result = validateIntent(baseIntent({ action: "swap" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("action")));
});

test("More than 14 decimal places is rejected", () => {
  const result = validateIntent(baseIntent({ amount: "0.000000000000001" }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Amount") || e.includes("precision")));
});

test("Exactly 14 decimal places is accepted", () => {
  const result = validateIntent(baseIntent({ amount: "0.00000000000001" }));
  assert.strictEqual(result.valid, true);
});

test("0.00000000000001 converts to exactly 1n", () => {
  assert.strictEqual(toBaseUnits("0.00000000000001"), 1n);
});

test("Large integer amounts are handled without precision loss", () => {
  assert.strictEqual(toBaseUnits("123456789"), 12345678900000000000000n);
  assert.strictEqual(toBaseUnits("99999999999999999999"), 9999999999999999999900000000000000n);
});

test("createIntent sets VALIDATED status on valid intent", () => {
  const intent = createIntent(baseIntent());
  assert.strictEqual(intent.status, INTENT_STATUS.VALIDATED);
});

test("createIntent sets REJECTED status on invalid intent", () => {
  const intent = createIntent(baseIntent({ amount: "0" }));
  assert.strictEqual(intent.status, INTENT_STATUS.REJECTED);
  assert.ok(intent.validationErrors.length > 0);
});

test("isValidSS58 rejects invalid address", () => {
  assert.strictEqual(isValidSS58("garbage"), false);
  assert.strictEqual(isValidSS58(""), false);
  assert.strictEqual(isValidSS58(null), false);
});

test("isValidSS58 accepts valid address", () => {
  assert.strictEqual(isValidSS58(VALID_SIGNER), true);
});

test("Missing signer is rejected", () => {
  const result = validateIntent(baseIntent({ signer: null }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("signer")));
});

test("Missing recipient is rejected", () => {
  const result = validateIntent(baseIntent({ recipient: null }));
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("recipient")));
});