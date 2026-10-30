import type { NetworkSnapshot } from './chain';
import type { ReadinessResult } from './readiness';
import { formatBaseUnits } from './format';
import { deriveDiagnostics } from './diagnostics';
import type { DiagnosticFinding } from './diagnostics';
import type { EvmIdentitySnapshot } from './evmChain';
import { compareDualInterface, type DualInterfaceComparison } from './dualInterface';

export type PassportStatus =
  | 'VERIFIED'
  | 'FAILED'
  | 'WARNING'
  | 'INCONCLUSIVE'
  | 'NOT_TESTED'
  | 'UNAVAILABLE';

export interface PassportCheck {
  name: string;
  status: PassportStatus;
  explanation: string;
  evidence?: string | null;
  timestamp?: number | null;
}

export interface PassportNetwork {
  name: string | null;
  genesisHash: string | null;
  specName: string | null;
  specVersion: string | null;
  transactionVersion: string | null;
  tokenDecimals: number | null;
  expectedGenesisHash: string | null;
  networkIdentityVerified: boolean;
}

export interface PassportAccount {
  address: string | null;
  redacted: boolean;
  walletConnected: boolean;
}

export interface PassportTransaction {
  recipient: string | null;
  recipientRedacted: boolean;
  amountDecimal: string | null;
  amountBaseUnits: string | null;
  callSection: string | null;
  callMethod: string | null;
  encodedCall: string | null;
}

export interface PassportFee {
  partialFeeBaseUnits: string | null;
  weight: string | null;
  method: string | null;
}

export interface PassportBalance {
  availableBaseUnits: string | null;
  decimals: number;
  estimatedRemainingBaseUnits: string | null;
  sufficient: boolean | null;
}

export interface PassportSigning {
  status: 'NOT_TESTED';
  interfaceDetected: boolean;
  note: string;
}

export interface TransactionReadinessPassport {
  schemaVersion: string;
  reportId: string;
  generatedAtUtc: string;
  generatedAtEpochMs: number;
  overallAssessment: 'Ready for further review' | 'Issues detected' | 'Incomplete evidence';
  network: PassportNetwork;
  account: PassportAccount;
  transaction: PassportTransaction;
  fee: PassportFee;
  balance: PassportBalance;
  checks: PassportCheck[];
  signingCompatibility: PassportSigning;
  limitations: string[];
  diagnostics: DiagnosticFinding[];
  diagnosticSchemaVersion: string;
  dualInterface?: {
    substrateStatus: string;
    evmStatus: string;
    evmChainId: string | null;
    evmGenesisBlockHash: string | null;
    substrateGenesisHash: string | null;
    crossInterfaceEquivalence: string;
    limitations: string[];
  };
}

export interface BuildPassportInput {
  generatedAt?: number;
  network: NetworkSnapshot | null;
  expectedGenesisHash?: string | null;
  walletAddress: string | null;
  walletConnected: boolean;
  signerInterfaceDetected?: boolean;
  decimals: number;
  result: ReadinessResult | null;
  revealAddresses?: boolean;
  evmSnapshot?: EvmIdentitySnapshot | null;
  dualInterface?: DualInterfaceComparison | null;
}

function redactAddress(address: string | null, reveal: boolean): string | null {
  if (!address) return null;
  if (reveal) return address;
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// removed unused helper

function networkVerified(network: NetworkSnapshot | null, expected: string | null): boolean {
  if (!network?.genesisHash || !expected) return false;
  return network.genesisHash === expected;
}

export function buildTransactionReadinessPassport(input: BuildPassportInput): TransactionReadinessPassport {
  const generatedAt = input.generatedAt ?? Date.now();
  const reveal = input.revealAddresses === true;
  const network = input.network;
  const result = input.result;
  const expectedGenesis = input.expectedGenesisHash ?? null;

  const checks: PassportCheck[] = [];

  const netVerified = networkVerified(network, expectedGenesis);
  const evmSnapshot = input.evmSnapshot ?? null;
  const dualComparison =
    input.dualInterface ??
    compareDualInterface({
      substrateSnapshot: network,
      substrateIdentityVerified: netVerified,
      evmSnapshot,
      observedAt: generatedAt,
    });
  checks.push({
    name: 'Network identity',
    status: !network
      ? 'UNAVAILABLE'
      : netVerified
        ? 'VERIFIED'
        : network.genesisHash
          ? 'FAILED'
          : 'INCONCLUSIVE',
    explanation: !network
      ? 'No live network snapshot is available.'
      : netVerified
        ? 'Live genesis hash matches the expected Portaldot V3 genesis hash.'
        : 'Live network identity does not match the expected Portaldot V3 identity.',
    evidence: network?.genesisHash ?? null,
    timestamp: generatedAt,
  });

  checks.push({
    name: 'Dual-interface identity',
    status: dualComparison.overallStatus,
    explanation:
      dualComparison.crossInterfaceEquivalence === 'INCONCLUSIVE'
        ? 'Substrate and EVM identities were evaluated independently; cross-interface equivalence is inconclusive.'
        : 'Dual-interface identity was evaluated.',
    evidence: `substrate=${dualComparison.substrateStatus}; evm=${dualComparison.evmStatus}; evmChainId=${dualComparison.evmChainIdComparison.observed ?? 'unavailable'}; crossInterfaceEquivalence=${dualComparison.crossInterfaceEquivalence}`,
    timestamp: generatedAt,
  });

  checks.push({
    name: 'Wallet connection',
    status: input.walletConnected && input.walletAddress ? 'VERIFIED' : 'UNAVAILABLE',
    explanation:
      input.walletConnected && input.walletAddress
        ? 'A wallet account is connected.'
        : 'No wallet account is connected.',
    evidence: redactAddress(input.walletAddress, reveal),
    timestamp: generatedAt,
  });

  const signerAccount = result?.account.signer ?? null;
  checks.push({
    name: 'Balance read',
    status: signerAccount && signerAccount.free !== null ? 'VERIFIED' : result ? 'UNAVAILABLE' : 'NOT_TESTED',
    explanation: signerAccount && signerAccount.free !== null
      ? 'Sender balance was read from the node.'
      : result
        ? 'Sender balance is unavailable.'
        : 'No readiness check has been run.',
    evidence: signerAccount?.free ?? null,
    timestamp: result?.finishedAt ?? null,
  });

  const feeAvailable = result?.fee.estimate?.partialFee != null;
  checks.push({
    name: 'Fee estimate',
    status: !result
      ? 'NOT_TESTED'
      : feeAvailable
        ? 'VERIFIED'
        : 'UNAVAILABLE',
    explanation: !result
      ? 'No readiness check has been run.'
      : feeAvailable
        ? `Fee estimated via ${result.fee.estimate?.method ?? 'runtime'}.`
        : 'Fee estimate is unavailable.',
    evidence: result?.fee.estimate?.partialFee ?? null,
    timestamp: result?.finishedAt ?? null,
  });

  let sufficient: boolean | null = null;
  if (result && feeAvailable && signerAccount && signerAccount.free !== null) {
    try {
      const free = BigInt(signerAccount.free);
      const frozen =
        signerAccount.miscFrozen !== null && signerAccount.feeFrozen !== null
          ? BigInt(signerAccount.miscFrozen) + BigInt(signerAccount.feeFrozen)
          : signerAccount.frozen !== null
            ? BigInt(signerAccount.frozen)
            : 0n;
      const available = free - frozen;
      const amount = BigInt(result.preview?.amountBaseUnits ?? '0');
      const fee = BigInt(result.fee.estimate!.partialFee);
      sufficient = available >= amount + fee;
    } catch {
      sufficient = null;
    }
  }

  checks.push({
    name: 'Balance sufficiency',
    status: !result
      ? 'NOT_TESTED'
      : !feeAvailable || !signerAccount || signerAccount.free === null
        ? 'UNAVAILABLE'
        : sufficient === true
          ? 'VERIFIED'
          : sufficient === false
            ? 'FAILED'
            : 'INCONCLUSIVE',
    explanation: !result
      ? 'No readiness check has been run.'
      : !feeAvailable || !signerAccount || signerAccount.free === null
        ? 'Balance or fee data is unavailable, so sufficiency cannot be verified.'
        : sufficient === true
          ? 'Available balance covers amount plus estimated fee.'
          : sufficient === false
            ? 'Available balance does not cover amount plus estimated fee.'
            : 'Sufficiency could not be determined.',
    evidence:
        result && feeAvailable && signerAccount && signerAccount.free !== null
        ? `required=${result.preview?.amountBaseUnits ?? '0'} + ${result.fee.estimate?.partialFee ?? '0'}`
        : null,
    timestamp: result?.finishedAt ?? null,
  });

  const simulationStatus = result?.simulation.status;
  checks.push({
    name: 'Unsigned dry-run',
    status: !result
      ? 'NOT_TESTED'
      : simulationStatus === 'PASS'
        ? 'VERIFIED'
        : simulationStatus === 'ERROR'
          ? 'FAILED'
          : simulationStatus === 'WARNING'
            ? 'INCONCLUSIVE'
            : 'UNAVAILABLE',
    explanation: !result
      ? 'No readiness check has been run.'
      : simulationStatus === 'PASS'
        ? 'The runtime simulated the unsigned dispatch successfully.'
        : simulationStatus === 'ERROR'
          ? 'The dry-run RPC call failed.'
          : simulationStatus === 'WARNING'
            ? 'The unsigned dry-run is inconclusive because it runs without a signature.'
            : 'Dry-run was not performed.',
    evidence: result?.simulation.result?.dispatchError ?? result?.simulation.result?.blockHash ?? null,
    timestamp: result?.finishedAt ?? null,
  });

  checks.push({
    name: 'Signing compatibility',
    status: 'NOT_TESTED',
    explanation:
      'Signing compatibility is not verified. Interface detection only; no signing was performed.',
    evidence: input.signerInterfaceDetected ? 'signer interface detected' : 'signer interface not detected',
    timestamp: generatedAt,
  });

  const hasFailed = checks.some((c) => c.status === 'FAILED');
  const hasIncomplete = checks.some((c) =>
    ['WARNING', 'INCONCLUSIVE', 'NOT_TESTED', 'UNAVAILABLE'].includes(c.status),
  );
  const overallAssessment = hasFailed
    ? 'Issues detected'
    : hasIncomplete
      ? 'Incomplete evidence'
      : 'Ready for further review';

  const limitations = [
    'Read-only diagnostics only; no transaction was signed or submitted.',
    'Fee values are estimates and may differ from the final charged fee.',
    'Dry-run results are unsigned and may return BadOrigin.',
    'Signing compatibility with the Portaldot extension is not verified.',
    'Frozen-balance semantics are conservative where runtime breakdown is unavailable.',
  ];

  const availableBalance =
    signerAccount && signerAccount.free !== null
      ? (() => {
          try {
            const free = BigInt(signerAccount.free);
            const frozen =
              signerAccount.miscFrozen !== null && signerAccount.feeFrozen !== null
                ? BigInt(signerAccount.miscFrozen) + BigInt(signerAccount.feeFrozen)
                : signerAccount.frozen !== null
                  ? BigInt(signerAccount.frozen)
                  : 0n;
            return (free - frozen).toString();
          } catch {
            return null;
          }
        })()
      : null;

  let remaining: string | null = null;
  if (availableBalance !== null && result?.preview?.amountBaseUnits && result.fee.estimate?.partialFee != null) {
    try {
      remaining = (
        BigInt(availableBalance) -
        BigInt(result.preview.amountBaseUnits) -
        BigInt(result.fee.estimate.partialFee)
      ).toString();
    } catch {
      remaining = null;
    }
  }

  const passport = {
    schemaVersion: '1.0',
    reportId: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `report-${generatedAt}`,
    generatedAtUtc: new Date(generatedAt).toISOString(),
    generatedAtEpochMs: generatedAt,
    overallAssessment,
    network: {
      name: network?.chain ?? null,
      genesisHash: network?.genesisHash ?? null,
      specName: network?.specName ?? null,
      specVersion: network?.specVersion ?? null,
      transactionVersion: network?.transactionVersion ?? null,
      tokenDecimals: network?.tokenDecimals ?? input.decimals,
      expectedGenesisHash: expectedGenesis,
      networkIdentityVerified: netVerified,
    },
    account: {
      address: redactAddress(input.walletAddress, reveal),
      redacted: !reveal,
      walletConnected: input.walletConnected,
    },
    transaction: {
      recipient: redactAddress(result?.account.recipient?.address ?? null, reveal),
      recipientRedacted: !reveal,
      amountDecimal: result?.preview?.amountBaseUnits
        ? formatBaseUnits(result.preview.amountBaseUnits, input.decimals)
        : null,
      amountBaseUnits: result?.preview?.amountBaseUnits ?? null,
      callSection: result?.preview?.pallet ?? null,
      callMethod: result?.preview?.method ?? null,
      encodedCall: result?.preview?.callHex ?? null,
    },
    fee: {
      partialFeeBaseUnits: result?.fee.estimate?.partialFee ?? null,
      weight: result?.fee.estimate?.weight ?? null,
      method: result?.fee.estimate?.method ?? null,
    },
    balance: {
      availableBaseUnits: availableBalance,
      decimals: input.decimals,
      estimatedRemainingBaseUnits: remaining,
      sufficient,
    },
    checks,
    signingCompatibility: {
      status: 'NOT_TESTED',
      interfaceDetected: input.signerInterfaceDetected === true,
      note: 'Signing compatibility is not verified. Interface detection only.',
    },
    limitations,
  } as TransactionReadinessPassport;
  passport.dualInterface = {
    substrateStatus: dualComparison.substrateStatus,
    evmStatus: dualComparison.evmStatus,
    evmChainId: dualComparison.evmChainIdComparison.observed,
    evmGenesisBlockHash: dualComparison.evmGenesisBlockHash,
    substrateGenesisHash: dualComparison.substrateGenesisHash,
    crossInterfaceEquivalence: dualComparison.crossInterfaceEquivalence,
    limitations: dualComparison.limitations,
  };
  passport.diagnostics = deriveDiagnostics(passport);
  passport.diagnosticSchemaVersion = '1.0';
  return passport;
}

export function passportToJson(passport: TransactionReadinessPassport): string {
  return JSON.stringify(passport, null, 2);
}

export function passportToMarkdown(passport: TransactionReadinessPassport): string {
  const lines: string[] = [];
  lines.push('# Transaction Readiness Passport');
  lines.push('');
  lines.push(`Generated (UTC): ${passport.generatedAtUtc}`);
  lines.push(`Report ID: ${passport.reportId}`);
  lines.push(`Overall assessment: ${passport.overallAssessment}`);
  lines.push('');
  lines.push('## Network');
  lines.push(`- Name: ${passport.network.name ?? 'unavailable'}`);
  lines.push(`- Genesis hash: ${passport.network.genesisHash ?? 'unavailable'}`);
  lines.push(`- Spec: ${passport.network.specName ?? 'unavailable'} ${passport.network.specVersion ?? ''}`.trim());
  lines.push(`- Transaction version: ${passport.network.transactionVersion ?? 'unavailable'}`);
  lines.push('');
  lines.push('## Transaction');
  lines.push(`- Recipient: ${passport.transaction.recipient ?? 'unavailable'}`);
  lines.push(`- Amount (base units): ${passport.transaction.amountBaseUnits ?? 'unavailable'}`);
  lines.push(`- Call: ${passport.transaction.callSection ?? 'unavailable'}.${passport.transaction.callMethod ?? 'unavailable'}`);
  lines.push(`- Encoded call: ${passport.transaction.encodedCall ?? 'unavailable'}`);
  lines.push('');
  lines.push('## Fee');
  lines.push(`- Partial fee (base units): ${passport.fee.partialFeeBaseUnits ?? 'unavailable'}`);
  lines.push(`- Weight: ${passport.fee.weight ?? 'unavailable'}`);
  lines.push('');
  lines.push('## Balance');
  lines.push(`- Available (base units): ${passport.balance.availableBaseUnits ?? 'unavailable'}`);
  lines.push(`- Estimated remaining (base units): ${passport.balance.estimatedRemainingBaseUnits ?? 'unavailable'}`);
  lines.push(`- Sufficient: ${passport.balance.sufficient === null ? 'unavailable' : passport.balance.sufficient ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Checks');
  for (const check of passport.checks) {
    lines.push(`- ${check.name}: ${check.status} - ${check.explanation}`);
  }
  lines.push('');
  lines.push('## Explainable findings');
  if (passport.diagnostics.length === 0) {
    lines.push('- No findings generated.');
  } else {
    for (const finding of passport.diagnostics) {
      lines.push(`### ${finding.title} (${finding.code})`);
      lines.push(`- Status: ${finding.status}`);
      lines.push(`- Explanation: ${finding.explanation}`);
      lines.push(`- Why it matters: ${finding.whyItMatters}`);
      lines.push(`- Evidence: ${finding.evidence ?? 'unavailable'}`);
      lines.push(`- Suggested action: ${finding.suggestedAction ?? 'none'}`);
      lines.push(`- Related check: ${finding.relatedCheck}`);
      lines.push('');
    }
  }
    lines.push('## Dual-interface identity');
    lines.push(`- Substrate status: ${passport.dualInterface?.substrateStatus ?? 'unavailable'}`);
    lines.push(`- EVM status: ${passport.dualInterface?.evmStatus ?? 'unavailable'}`);
    lines.push(`- EVM chain ID: ${passport.dualInterface?.evmChainId ?? 'unavailable'}`);
    lines.push(`- Substrate genesis hash: ${passport.dualInterface?.substrateGenesisHash ?? 'unavailable'}`);
    lines.push(`- EVM genesis block hash: ${passport.dualInterface?.evmGenesisBlockHash ?? 'unavailable'}`);
    lines.push(`- Cross-interface equivalence: ${passport.dualInterface?.crossInterfaceEquivalence ?? 'INCONCLUSIVE'}`);
    lines.push('');
  lines.push(`- Status: ${passport.signingCompatibility.status}`);
  lines.push(`- ${passport.signingCompatibility.note}`);
  lines.push('');
  lines.push('## Limitations');
  for (const limitation of passport.limitations) {
    lines.push(`- ${limitation}`);
  }
  return lines.join('\n');
}
