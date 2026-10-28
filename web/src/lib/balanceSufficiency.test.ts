import { describe, expect, it } from 'vitest';

import { evaluateFundsSufficiency } from './balanceSufficiency';

describe('evaluateFundsSufficiency', () => {
  it('returns yes when available balance covers amount plus fee', () => {
    expect(evaluateFundsSufficiency('100000000000000', '10000000000000', '1000')).toBe('yes');
  });

  it('returns no when available balance is insufficient', () => {
    expect(evaluateFundsSufficiency('1000', '10000000000000', '1000')).toBe('no');
  });

  it('returns unverifiable when fee data is unavailable', () => {
    expect(evaluateFundsSufficiency('100000000000000', '10000000000000', null)).toBe('unverifiable');
  });

  it('returns unverifiable when balance data is unavailable', () => {
    expect(evaluateFundsSufficiency(null, '10000000000000', '1000')).toBe('unverifiable');
  });
});
