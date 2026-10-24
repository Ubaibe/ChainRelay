import { describe, expect, it } from 'vitest';

import {
  EXPECTED_NETWORK,
  diffNetwork,
  EMPTY_NETWORK,
  type NetworkSnapshot,
} from '../lib/chain';

const MATCHING: NetworkSnapshot = {
  chain: 'PortaldotV3 Test',
  nodeName: 'PortaldotV3 Node',
  nodeVersion: '3.0.0-dev',
  blockHeight: '133921',
  specName: 'portaldot-v3',
  specVersion: '3002',
  implVersion: '1',
  transactionVersion: '1',
  tokenSymbol: 'tPOT',
  tokenDecimals: 14,
  ss58Prefix: 42,
  genesisHash: '0xd4f9acbc',
};

describe('diffNetwork', () => {
  it('reports no mismatches when the live values match the expected network', () => {
    expect(diffNetwork(MATCHING)).toEqual([]);
  });

  it('reports a mismatch for each differing observed value', () => {
    const mismatches = diffNetwork({
      ...MATCHING,
      chain: 'Some Other Chain',
      specVersion: '3001',
      tokenDecimals: 12,
    });

    expect(mismatches).toEqual([
      { field: 'chain', expected: 'PortaldotV3 Test', observed: 'Some Other Chain' },
      { field: 'specVersion', expected: '3002', observed: '3001' },
      { field: 'tokenDecimals', expected: '14', observed: '12' },
    ]);
  });

  it('ignores values the node did not report', () => {
    const mismatches = diffNetwork({
      ...EMPTY_NETWORK,
      chain: 'PortaldotV3 Test',
    });
    expect(mismatches).toEqual([]);
  });

  it('treats an empty observed value as not reported', () => {
    const mismatches = diffNetwork({ ...MATCHING, chain: '' });
    expect(mismatches).toEqual([]);
  });

  it('compares against the documented V3 expectations', () => {
    expect(EXPECTED_NETWORK).toEqual({
      chain: 'PortaldotV3 Test',
      specName: 'portaldot-v3',
      specVersion: '3002',
      tokenSymbol: 'tPOT',
      tokenDecimals: 14,
      ss58Prefix: 42,
      evmChainId: '420420777',
    });
  });
});
