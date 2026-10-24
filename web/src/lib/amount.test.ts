import { describe, expect, it } from 'vitest';

import { toBaseUnits } from '../lib/core';
import { formatBaseUnits, abbreviateAddress, formatWeight } from '../lib/format';

describe('toBaseUnits (shared ChainRelay core)', () => {
  it('converts a whole number exactly', () => {
    expect(toBaseUnits('1', 14)).toBe(100000000000000n);
  });

  it('converts a decimal exactly', () => {
    expect(toBaseUnits('1.5', 14)).toBe(150000000000000n);
  });

  it('preserves all 14 decimal places', () => {
    expect(toBaseUnits('0.00000000000001', 14)).toBe(1n);
  });

  it('handles values beyond Number.MAX_SAFE_INTEGER without loss', () => {
    const value = toBaseUnits('90071992.5474093', 14);
    expect(value).toBe(9007199254740930000000n);
    expect(value.toString()).toBe('9007199254740930000000');
  });

  it('rejects zero', () => {
    expect(() => toBaseUnits('0', 14)).toThrow(/greater than zero/);
  });

  it('rejects negative amounts', () => {
    expect(() => toBaseUnits('-1', 14)).toThrow(/negative/);
  });

  it('rejects scientific notation', () => {
    expect(() => toBaseUnits('1e3', 14)).toThrow(/Scientific notation/);
  });

  it('rejects more than 14 decimals', () => {
    expect(() => toBaseUnits('0.000000000000001', 14)).toThrow(/precision/);
  });

  it('rejects malformed decimal strings', () => {
    expect(() => toBaseUnits('.5', 14)).toThrow(/Malformed/);
    expect(() => toBaseUnits('1.2.3', 14)).toThrow(/Malformed/);
    expect(() => toBaseUnits('abc', 14)).toThrow(/Malformed/);
  });
});

describe('formatBaseUnits', () => {
  it('formats base units as a decimal string', () => {
    expect(formatBaseUnits('150000000000000', 14)).toBe('1.5');
  });

  it('formats a single base unit', () => {
    expect(formatBaseUnits('1', 14)).toBe('0.00000000000001');
  });

  it('formats zero without decimals', () => {
    expect(formatBaseUnits('0', 14)).toBe('0');
  });

  it('keeps full precision for huge values', () => {
    expect(formatBaseUnits('9007199254740930000000', 14)).toBe(
      '90071992.5474093',
    );
  });

  it('reports unavailable for missing values', () => {
    expect(formatBaseUnits(null, 14)).toBe('unavailable');
    expect(formatBaseUnits(undefined, 14)).toBe('unavailable');
  });
});

describe('abbreviateAddress', () => {
  it('abbreviates a long address', () => {
    const address = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
    expect(abbreviateAddress(address)).toBe('5GrwvaEF…GKutQY');
  });

  it('leaves short values untouched', () => {
    expect(abbreviateAddress('short')).toBe('short');
  });
});

describe('formatWeight', () => {
  it('passes strings through', () => {
    expect(formatWeight('179881000')).toBe('179881000');
  });

  it('renders structured weights', () => {
    expect(formatWeight({ refTime: 656445000, proofSize: 15777 })).toBe(
      'refTime=656445000 proofSize=15777',
    );
  });

  it('reports unavailable for missing weights', () => {
    expect(formatWeight(null)).toBe('unavailable');
  });
});
