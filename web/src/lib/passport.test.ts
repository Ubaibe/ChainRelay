import { describe, expect, it } from 'vitest';

import { buildTransactionReadinessPassport, passportToJson, passportToMarkdown } from './passport';
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
  genesisHash: '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd',
};

describe('buildTransactionReadinessPassport', () => {
  it('marks signing compatibility as NOT_TESTED', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd',
      walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      walletConnected: true,
      decimals: 14,
      result: null,
    });
    expect(passport.signingCompatibility.status).toBe('NOT_TESTED');
    expect(passport.overallAssessment).toBe('Incomplete evidence');
  });

  it('marks missing fee as UNAVAILABLE', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd',
      walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      walletConnected: true,
      decimals: 14,
      result: {
        startedAt: 1,
        finishedAt: 2,
        validation: { status: 'PASS', headline: '', details: [], errors: [] },
        account: { status: 'PASS', headline: '', details: [], signer: { address: 'a', free: '1000', reserved: '0', miscFrozen: '0', feeFrozen: '0', frozen: '0', flags: null, frozenBreakdownKnown: true }, recipient: null },
        construct: { status: 'PASS', headline: '', details: [] },
        fee: { status: 'ERROR', headline: '', details: [], estimate: null },
        readiness: { status: 'NOT_CHECKED', headline: '', details: [] },
        simulation: { status: 'NOT_CHECKED', headline: '', details: [], result: null },
        warnings: [],
        preview: { pallet: 'balances', method: 'transferKeepAlive', recipient: 'b', amountBaseUnits: '100', callHex: '0x' },
      } as unknown as ReadinessResult,
    });
    const feeCheck = passport.checks.find((c) => c.name === 'Fee estimate');
    expect(feeCheck?.status).toBe('UNAVAILABLE');
  });

  it('redacts addresses by default', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      walletConnected: true,
      decimals: 14,
      result: null,
    });
    expect(passport.account.address).not.toBe('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
    expect(passport.account.redacted).toBe(true);
  });

  it('serializes JSON and Markdown consistently', () => {
    const passport = buildTransactionReadinessPassport({
      network,
      expectedGenesisHash: network.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const json = passportToJson(passport);
    const md = passportToMarkdown(passport);
    expect(JSON.parse(json).reportId).toBe(passport.reportId);
    expect(md).toContain(passport.reportId);
  });
});

describe('passport targeted regressions', () => {
  const baseNetwork: NetworkSnapshot = {
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

  it('treats a zero balance as verified and evaluates sufficiency', () => {
    const result = makeResult();
    result.account.signer!.free = '0';
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      walletConnected: true,
      decimals: 14,
      result,
    });
    expect(passport.checks.find((c) => c.name === 'Balance read')?.status).toBe('VERIFIED');
    expect(passport.checks.find((c) => c.name === 'Balance sufficiency')?.status).toBe('FAILED');
  });

  it('marks a missing balance as unavailable', () => {
    const result = makeResult();
    result.account.signer = { address: 'a', free: null as unknown as string, reserved: '0', miscFrozen: '0', feeFrozen: '0', frozen: '0', flags: null, frozenBreakdownKnown: true };
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result,
    });
    expect(passport.checks.find((c) => c.name === 'Balance read')?.status).toBe('UNAVAILABLE');
  });

  it('does not turn a missing fee into zero', () => {
    const result = makeResult();
    result.fee.estimate = null;
    result.fee.status = 'ERROR';
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result,
    });
    expect(passport.fee.partialFeeBaseUnits).toBeNull();
    expect(passport.checks.find((c) => c.name === 'Fee estimate')?.status).toBe('UNAVAILABLE');
  });

  it('marks a mismatched network identity as failed', () => {
    const passport = buildTransactionReadinessPassport({
      network: { ...baseNetwork, genesisHash: '0xwrong' },
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    expect(passport.checks.find((c) => c.name === 'Network identity')?.status).toBe('FAILED');
    expect(passport.overallAssessment).not.toBe('Ready for further review');
  });

  it('marks an unsigned BadOrigin dry-run as inconclusive', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: makeResult(),
    });
    expect(passport.checks.find((c) => c.name === 'Unsigned dry-run')?.status).toBe('INCONCLUSIVE');
  });

  it('serializes large BigInt-derived values as exact strings', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: makeResult(),
    });
    expect(passport.balance.availableBaseUnits).toBe('1000000000000000');
    expect(passport.transaction.amountDecimal).toBe('1');
    expect(JSON.parse(passportToJson(passport)).transaction.amountBaseUnits).toBe('100000000000000');
  });

  it('redacts addresses in JSON and Markdown by default', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
      walletConnected: true,
      decimals: 14,
      result: makeResult(),
    });
    const json = passportToJson(passport);
    const md = passportToMarkdown(passport);
    expect(json).not.toContain('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
    expect(md).not.toContain('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY');
  });

  it('generates a report with incomplete data', () => {
    const passport = buildTransactionReadinessPassport({
      network: null,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    expect(passport.overallAssessment).toBe('Incomplete evidence');
    expect(passport.checks.find((c) => c.name === 'Signing compatibility')?.status).toBe('NOT_TESTED');
  });
});

describe('passport milestone 3 exports', () => {
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

  it('includes diagnostics in JSON export', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const json = JSON.parse(passportToJson(passport));
    expect(Array.isArray(json.diagnostics)).toBe(true);
    expect(json.diagnosticSchemaVersion).toBe('1.0');
    expect(json.diagnostics.some((d: { code: string }) => d.code === 'SIGNING_COMPATIBILITY_UNVERIFIED')).toBe(true);
  });

  it('includes Explainable Findings in Markdown export', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const md = passportToMarkdown(passport);
    expect(md).toContain('## Explainable findings');
    expect(md).toContain('SIGNING_COMPATIBILITY_UNVERIFIED');
  });

  it('keeps JSON and Markdown finding codes consistent', () => {
    const passport = buildTransactionReadinessPassport({
      network: baseNetwork,
      expectedGenesisHash: baseNetwork.genesisHash,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
    });
    const jsonCodes = JSON.parse(passportToJson(passport)).diagnostics.map((d: { code: string }) => d.code);
    const md = passportToMarkdown(passport);
    for (const code of jsonCodes) {
      expect(md).toContain(code);
    }
  });
});
