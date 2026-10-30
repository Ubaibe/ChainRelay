import { describe, expect, it } from 'vitest';

import { compareDualInterface } from './dualInterface';
import type { NetworkSnapshot } from './chain';
import type { EvmIdentitySnapshot } from './evmChain';

const substrateSnapshot: NetworkSnapshot = {
  chain: 'PortaldotV3 Test',
  nodeName: 'node',
  nodeVersion: '1',
  blockHeight: '1',
  specName: 'portaldot-v3',
  specVersion: '3002',
  implVersion: '1',
  transactionVersion: '1',
  tokenSymbol: 'tPOT',
  tokenDecimals: 14,
  ss58Prefix: 42,
  genesisHash: '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd',
};

const evmVerified: EvmIdentitySnapshot = {
  status: 'VERIFIED',
  chainId: '0x190f1ca9',
  chainIdDecimal: '420420777',
  genesisBlockNumber: '0x0',
  genesisBlockHash: '0x' + 'a'.repeat(64),
  observedAt: 123,
  evidence: 'chainId=0x190f1ca9; genesisBlockNumber=0x0; genesisBlockHash=0x' + 'a'.repeat(64),
  explanation: 'ok',
};

describe('compareDualInterface', () => {
  it('keeps cross-interface equivalence inconclusive even when both are verified', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: evmVerified,
      observedAt: 1,
    });
    expect(result.substrateStatus).toBe('VERIFIED');
    expect(result.evmStatus).toBe('VERIFIED');
    expect(result.crossInterfaceEquivalence).toBe('INCONCLUSIVE');
    expect(result.overallStatus).toBe('INCONCLUSIVE');
  });

  it('reports EVM chain ID mismatch as FAILED', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: { ...evmVerified, status: 'FAILED', chainIdDecimal: '1' },
    });
    expect(result.evmStatus).toBe('FAILED');
    expect(result.evmChainIdComparison.matches).toBe(false);
    expect(result.overallStatus).toBe('FAILED');
  });

  it('reports unavailable EVM endpoint', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: null,
    });
    expect(result.evmStatus).toBe('UNAVAILABLE');
    expect(result.overallStatus).toBe('UNAVAILABLE');
  });

  it('reports unavailable Substrate identity', () => {
    const result = compareDualInterface({
      substrateSnapshot: null,
      substrateIdentityVerified: null,
      evmSnapshot: evmVerified,
    });
    expect(result.substrateStatus).toBe('UNAVAILABLE');
    expect(result.overallStatus).toBe('UNAVAILABLE');
  });

  it('reports failed Substrate identity', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: false,
      evmSnapshot: evmVerified,
    });
    expect(result.substrateStatus).toBe('FAILED');
    expect(result.overallStatus).toBe('FAILED');
  });

  it('preserves missing Substrate genesis hash', () => {
    const result = compareDualInterface({
      substrateSnapshot: { ...substrateSnapshot, genesisHash: null },
      substrateIdentityVerified: null,
      evmSnapshot: evmVerified,
    });
    expect(result.substrateGenesisHash).toBeNull();
  });

  it('preserves missing EVM genesis block hash', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: { ...evmVerified, genesisBlockHash: null },
    });
    expect(result.evmGenesisBlockHash).toBeNull();
  });

  it('does not claim equivalence from matching chain IDs', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: evmVerified,
    });
    expect(result.crossInterfaceEquivalence).toBe('INCONCLUSIVE');
    expect(result.evidence).not.toContain('equivalent');
  });

  it('does not claim a false mismatch from different genesis hashes', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: evmVerified,
    });
    expect(result.crossInterfaceEquivalence).not.toBe('NOT_EQUIVALENT');
  });

  it('preserves independent evidence', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: evmVerified,
    });
    expect(result.evidence).toContain(substrateSnapshot.genesisHash!);
    expect(result.evidence).toContain(evmVerified.genesisBlockHash!);
  });

  it('does not produce a false positive overall verification', () => {
    const result = compareDualInterface({
      substrateSnapshot,
      substrateIdentityVerified: true,
      evmSnapshot: evmVerified,
    });
    expect(result.overallStatus).not.toBe('VERIFIED');
  });
});
