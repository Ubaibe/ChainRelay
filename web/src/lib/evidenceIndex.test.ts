import { describe, expect, it } from 'vitest';

import { buildEvidenceIndex } from './evidenceIndex';
import { buildTransactionReadinessPassport } from './passport';

describe('buildEvidenceIndex', () => {
  it('contains all ten categories', () => {
    const passport = buildTransactionReadinessPassport({
      network: null,
      expectedGenesisHash: null,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
      revealAddresses: false,
    });
    const index = buildEvidenceIndex(passport);
    const categories = new Set(index.map((item) => item.category));
    expect(categories).toContain('Network');
    expect(categories).toContain('Account');
    expect(categories).toContain('Transaction');
    expect(categories).toContain('Fee');
    expect(categories).toContain('Balance');
    expect(categories).toContain('Simulation');
    expect(categories).toContain('EVM');
    expect(categories).toContain('Dual-interface');
    expect(categories).toContain('Diagnostics');
    expect(categories).toContain('Timestamps');
  });

  it('keeps cross-interface equivalence inconclusive', () => {
    const passport = buildTransactionReadinessPassport({
      network: null,
      expectedGenesisHash: null,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
      revealAddresses: false,
    });
    const item = buildEvidenceIndex(passport).find((entry) => entry.id === 'dual.crossInterfaceEquivalence');
    expect(item?.value).toBe('INCONCLUSIVE');
  });

  it('marks missing EVM evidence unavailable', () => {
    const passport = buildTransactionReadinessPassport({
      network: null,
      expectedGenesisHash: null,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
      revealAddresses: false,
    });
    const item = buildEvidenceIndex(passport).find((entry) => entry.id === 'evm.status');
    expect(item?.status).toBe('UNAVAILABLE');
  });
});
