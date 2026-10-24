/**
 * Formatting helpers.
 *
 * All balance values stay as exact integer strings. Nothing here converts a
 * balance to a JavaScript Number, which would silently lose precision for
 * 14-decimal values.
 */

/**
 * Format a base-unit integer string as a human decimal string.
 *
 * Pure string manipulation: the integer is never parsed into a Number.
 *
 * @param value - base units as a decimal integer string
 * @param decimals - number of decimal places of the asset
 */
export function formatBaseUnits(
  value: string | null | undefined,
  decimals: number,
): string {
  if (value === null || value === undefined) {
    return 'unavailable';
  }

  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    // Not a plain integer string: return untouched rather than guessing.
    return trimmed === '' ? 'unavailable' : trimmed;
  }

  if (decimals <= 0) {
    return trimmed;
  }

  const padded = trimmed.padStart(decimals + 1, '0');
  const integerPart = padded.slice(0, padded.length - decimals);
  const fractionPart = padded.slice(padded.length - decimals).replace(/0+$/, '');

  return fractionPart.length > 0 ? `${integerPart}.${fractionPart}` : integerPart;
}

/**
 * Abbreviate an address for compact display.
 */
export function abbreviateAddress(address: string | null | undefined): string {
  if (!address) {
    return '—';
  }
  if (address.length <= 16) {
    return address;
  }
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

/**
 * Format a weight value for display. Weight may be a string or a structured
 * object depending on the runtime, so both are handled without Number casts.
 */
export function formatWeight(weight: unknown): string {
  if (weight === null || weight === undefined) {
    return 'unavailable';
  }
  if (typeof weight === 'string') {
    return weight;
  }
  if (typeof weight === 'object') {
    const entries = Object.entries(weight as Record<string, unknown>)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
    return entries || JSON.stringify(weight);
  }
  return String(weight);
}

/**
 * Format a wall-clock timestamp for display. This is a time value, not a
 * monetary one, so it is safe to use the Date API here.
 */
export function formatTimestamp(epochMs: number): string {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return 'unavailable';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
