import { describe, expect, it } from 'vitest';

import { buildTransactionReadinessPassport } from './passport';
import { deriveDiagnostics } from './diagnostics';
import type { NetworkSnapshot } from './chain';
import type { ReadinessResult } from './readiness';

const network: NetworkSnapshot = {
  chain: 'PortaldotV3 Test',
  nodeName: 'node',
  nodeVersion: '1',
  blockHeight: '1',
  specName: 'portaldot-v3',
  specVersion: '3002',
  implVersion: '1',
  transactionVersion: '2',
  tokenSymbol: 'tPOT',
  tokenDecimals: 14,
  ss58Prefix: 42,
  genesisHash: '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e87cfbccb155283bd',
};

function makeResult(overrides: Partial<ReadinessResult> = {}): ReadinessResult {
  return {
    startedAt: 1,
    finishedAt: 2,
    validation: { status: 'PASS', headline: '', details: [], errors: [] },
    account: {
      status: 'PASS',
      headline: '',
      details: [],
      signer: {
        address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        free: '1000000000000000',
        reserved: '0',
        miscFrozen: '0',
        feeFrozen: '0',
        frozen: '0',
        flags: null,
        frozenBreakdownKnown: true,
      },
      recipient: null,
    },
    construct: { status: 'PASS', headline: '', details: [] },
    fee: {
      status: 'PASS',
      headline: '',
      details: [],
      estimate: { signerAddress: 'a', partialFee: '1000', weight: '1', class: null, paysFee: null, isEstimate: true, method: 'paymentInfo' },
    },
    readiness: { status: 'PASS', headline: '', details: [] },
    simulation: { status: 'WARNING', headline: '', details: [], result: { signerAddress: 'a', blockHash: '0xabc', rpcOk: true, dispatchOk: false, dispatchError: 'BadOrigin', isEstimate: true, method: 'rpc.system.dryRun' } },
    warnings: [],
    preview: { pallet: 'balances', method: 'transferKeepAlive', recipient: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', amountBaseUnits: '100000000000000', callHex: '0x1234' },
    ...overrides,
  } as unknown as ReadinessResult;
}

describe('deriveDiagnostics', () => {
  it('derives findings from passport checks', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: makeResult(),
    });
    const findings = deriveDiagnostics(passport);
    expect(findings.some((f) => f.code === 'UNSIGNED_BAD_ORIGIN')).toBe(true);
    expect(findings.some((f) => f.code === 'SIGNING_COMPATIBILITY_UNVERIFIED')).toBe(true);
  });

  it('does not generate a failure for a verified check', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      walletConnected: true,
      decimals: 14,
      result: makeResult({ simulation: { status: 'PASS', headline: '', details: [], result: { signerAddress: 'a', blockHash: '0xabc', rpcOk: true, dispatchOk: true, isEstimate: true, method: 'rpc.system.dryRun' } } }),
    });
    const findings = deriveDiagnostics(passport);
    expect(findings.some((f) => f.code === 'SIMULATION_FAILURE')).toBe(false);
  });

  it('keeps unsigned BadOrigin inconclusive', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: makeResult(),
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'UNSIGNED_BAD_ORIGIN');
    expect(finding?.status).toBe('INCONCLUSIVE');
  });

  it('keeps signing compatibility untested', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'SIGNING_COMPATIBILITY_UNVERIFIED');
    expect(finding?.status).toBe('NOT_TESTED');
  });

  it('reports missing fee as unavailable, not a confirmed failure', () => {
    const result = makeResult();
    result.fee.estimate = null;
    result.fee.status = 'ERROR';
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result,
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'FEE_ESTIMATION_UNAVAILABLE');
    expect(finding?.status).toBe('UNAVAILABLE');
  });

  it('retains related check identifiers and exact evidence', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: makeResult(),
    });
    const findings = deriveDiagnostics(passport);
    expect(findings.every((f) => typeof f.relatedCheck === 'string' && f.relatedCheck.length > 0)).toBe(true);
    expect(findings.find((f) => f.code === 'UNSIGNED_BAD_ORIGIN')?.evidence).toContain('BadOrigin');
  });

  it('handles an incomplete passport safely', () => {
    const passport = buildTransactionReadinessPassport({
      network: null,
      expectedGenesisHash: network.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const findings = deriveDiagnostics(passport);
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.some((f) => f.code === 'INCOMPLETE_EVIDENCE')).toBe(true);
  });
});

describe('diagnostics milestone 2 evidence gating', () => {
  const baseNetwork = {
    chain: 'PortaldotV3 Test',
    nodeName: 'node',
    nodeVersion: '1',
    blockHeight: '1',
    specName: 'portaldot-v3',
    specVersion: '3002',
    implVersion: '1',
    transactionVersion: '2',
    tokenSymbol: 'tPOT',
    tokenDecimals: 14,
    ss58Prefix: 42,
    genesisHash: '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e87cfbccb155283bd',
  };

  function makeResult(overrides: Partial<ReadinessResult> = {}): ReadinessResult {
    return {
      startedAt: 1,
      finishedAt: 2,
      validation: { status: 'PASS', headline: '', details: [], errors: [] },
      account: {
        status: 'PASS',
        headline: '',
        details: [],
        signer: {
          address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          free: '1000000000000000',
          reserved: '0',
          miscFrozen: '0',
          feeFrozen: '0',
          frozen: '0',
          flags: null,
          frozenBreakdownKnown: true,
        },
        recipient: null,
      },
      construct: { status: 'PASS', headline: '', details: [] },
      fee: {
        status: 'PASS',
        headline: '',
        details: [],
        estimate: { signerAddress: 'a', partialFee: '1000', weight: '1', class: null, paysFee: null, isEstimate: true, method: 'paymentInfo' },
      },
      readiness: { status: 'PASS', headline: '', details: [] },
      simulation: { status: 'WARNING', headline: '', details: [], result: { signerAddress: 'a', blockHash: '0xabc', rpcOk: true, dispatchOk: false, dispatchError: 'BadOrigin', isEstimate: true, method: 'rpc.system.dryRun' } },
      warnings: [],
      preview: { pallet: 'balances', method: 'transferKeepAlive', recipient: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', amountBaseUnits: '100000000000000', callHex: '0x1234' },
      ...overrides,
    } as unknown as ReadinessResult;
  }

  it('distinguishes a disconnected wallet from balance-read failure', () => {
    const result = makeResult();
    result.account.signer = null as unknown as ReadinessResult['account']['signer'];
    result.account.status = 'ERROR';
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result,
    });
    const findings = deriveDiagnostics(passport);
    const walletFindings = findings.filter((f) => f.code === 'WALLET_UNAVAILABLE');
    expect(walletFindings).toHaveLength(1);
    expect(walletFindings[0].relatedCheck).toBe('Wallet connection');
  });

  it('distinguishes missing fee from confirmed fee failure', () => {
    const unavailableResult = makeResult();
    unavailableResult.fee.estimate = null;
    unavailableResult.fee.status = 'ERROR';
    const unavailablePassport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: unavailableResult,
    });
    const unavailableFinding = deriveDiagnostics(unavailablePassport).find((f) => f.code === 'FEE_ESTIMATION_UNAVAILABLE');
    expect(unavailableFinding?.title).toBe('Fee estimate unavailable');

    // A confirmed fee failure cannot currently be represented by the Passport:
    // fee estimation failures leave no estimate, so the Passport reports UNAVAILABLE.
  });

  it('uses actual values in insufficient balance explanation', () => {
    const result = makeResult();
    result.account.signer!.free = '1000';
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result,
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'INSUFFICIENT_BALANCE');
    expect(finding?.explanation).toContain('1000');
    expect(finding?.explanation).toContain('100000000000000');
  });

  it('does not invent a simulation cause', () => {
    const result = makeResult();
    result.simulation.status = 'ERROR';
    result.simulation.result = { signerAddress: 'a', blockHash: '0xabc', rpcOk: false, dispatchOk: false, dispatchError: 'Method not found', isEstimate: true, method: 'rpc.system.dryRun' };
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result,
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'SIMULATION_FAILURE');
    expect(finding?.explanation).toContain('Method not found');
    expect(finding?.explanation).not.toContain('will fail');
  });

  it('preserves uncertainty for unsigned BadOrigin', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: makeResult(),
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'UNSIGNED_BAD_ORIGIN');
    expect(finding?.explanation).toContain('does not establish');
    expect(finding?.suggestedAction).not.toContain('sign');
  });

  it('never claims signing support', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'SIGNING_COMPATIBILITY_UNVERIFIED');
    expect(finding?.explanation).toContain('unverified');
    expect(finding?.suggestedAction).toContain('Do not sign');
  });

  it('identifies incomplete checks', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: makeResult(),
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'INCOMPLETE_EVIDENCE');
    expect(finding?.evidence).toContain('Signing compatibility');
  });

  it('keeps corrective actions evidence-appropriate', () => {
    const passport = buildTransactionReadinessPassport({
      network: { ...baseNetwork, genesisHash: '0xwrong' },
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const finding = deriveDiagnostics(passport).find((f) => f.code === 'NETWORK_IDENTITY_MISMATCH');
    expect(finding?.suggestedAction).toContain('endpoint');
  });

  it('avoids duplicate findings for the same underlying issue', () => {
    const result = makeResult();
    result.account.signer = null as unknown as ReadinessResult['account']['signer'];
    result.account.status = 'ERROR';
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result,
    });
    const walletFindings = deriveDiagnostics(passport).filter((f) => f.code === 'WALLET_UNAVAILABLE');
    expect(walletFindings).toHaveLength(1);
  });
});
