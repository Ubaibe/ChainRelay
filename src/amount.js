/**
 * ChainRelay — Amount Conversion
 *
 * Exact POT (14 decimal places) conversion.
 * Never uses Number() for conversion.
 */

/**
 * Convert a decimal string amount to base units (BigInt).
 *
 * @param {string} amount - decimal string, e.g. "1.5"
 * @param {number} decimals - number of decimal places (default 14 for POT)
 * @returns {bigint} exact base-unit BigInt
 */
function toBaseUnits(amount, decimals = 14) {
  if (typeof amount !== "string") {
    throw new Error("Amount must be a string");
  }

  const trimmed = amount.trim();

  if (trimmed === "") {
    throw new Error("Amount must not be empty");
  }

  // Reject negative
  if (trimmed.startsWith("-")) {
    throw new Error("Amount must not be negative");
  }

  // Reject scientific notation
  if (/e/i.test(trimmed)) {
    throw new Error("Scientific notation is not allowed");
  }

  // Split on decimal point
  const parts = trimmed.split(".");

  let integerPart;
  let fractionalPart = "";

  if (parts.length === 1) {
    integerPart = parts[0];
  } else if (parts.length === 2) {
    integerPart = parts[0];
    fractionalPart = parts[1];
  } else {
    throw new Error("Malformed decimal string");
  }

  // Reject empty integer part (e.g. ".1" or just ".")
  if (integerPart === "") {
    throw new Error("Malformed decimal string");
  }

  // Reject non-digit characters
  if (!/^\d+$/.test(integerPart)) {
    throw new Error("Malformed decimal string");
  }
  if (fractionalPart !== "" && !/^\d+$/.test(fractionalPart)) {
    throw new Error("Malformed decimal string");
  }

  // Reject more than `decimals` fractional digits
  if (fractionalPart.length > decimals) {
    throw new Error(
      `Amount exceeds maximum precision of ${decimals} decimals`
    );
  }

  // Pad fractional part to `decimals` digits
  const paddedFractional = fractionalPart.padEnd(decimals, "0");

  const baseUnits = BigInt(integerPart + paddedFractional);

  // Reject zero
  if (baseUnits === 0n) {
    throw new Error("Amount must be greater than zero");
  }

  return baseUnits;
}

module.exports = {
  toBaseUnits,
};