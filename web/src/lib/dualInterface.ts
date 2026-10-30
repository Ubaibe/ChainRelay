import type { NetworkSnapshot } from './chain';
import type { EvmIdentitySnapshot } from './evmChain';

export type DualInterfaceStatus =
  | 'VERIFIED'
  | 'FAILED'
  | 'WARNING'
  | 'INCONCLUSIVE'
  | 'NOT_TESTED'
  | 'UNAVAILABLE';

export type CrossInterfaceEquivalenceStatus = 'EQUIVALENT' | 'NOT_EQUIVALENT' | 'INCONCLUSIVE';

export interface DualInterfaceComparison {
  overallStatus: DualInterfaceStatus;
  substrateStatus: DualInterfaceStatus;
  evmStatus: DualInterfaceStatus;
  evmChainIdComparison: {
    expected: string;
    observed: string | null;
    matches: boolean | null;
  };
  substrateGenesisHash: string | null;
  evmGenesisBlockHash: string | null;
  crossInterfaceEquivalence: CrossInterfaceEquivalenceStatus;
  evidence: string;
  limitations: string[];
  observedAt: number | null;
}

export interface BuildDualInterfaceInput {
  substrateSnapshot?: NetworkSnapshot | null;
  substrateIdentityVerified?: boolean | null;
  evmSnapshot?: EvmIdentitySnapshot | null;
  expectedEvmChainId?: string | null;
  observedAt?: number;
}

const EXPECTED_EVM_CHAIN_ID = '420420777';

export function compareDualInterface(input: BuildDualInterfaceInput): DualInterfaceComparison {
  const observedAt = input.observedAt ?? Date.now();
  const substrateSnapshot = input.substrateSnapshot ?? null;
  const evmSnapshot = input.evmSnapshot ?? null;

  const substrateStatus: DualInterfaceStatus =
    input.substrateIdentityVerified === true
      ? 'VERIFIED'
      : input.substrateIdentityVerified === false
        ? (substrateSnapshot?.genesisHash ? 'FAILED' : 'UNAVAILABLE')
        : substrateSnapshot === null
          ? 'UNAVAILABLE'
          : substrateSnapshot.genesisHash
            ? 'INCONCLUSIVE'
            : 'UNAVAILABLE';

  const evmStatus: DualInterfaceStatus = evmSnapshot?.status ?? 'UNAVAILABLE';

  const expectedChainId = input.expectedEvmChainId ?? EXPECTED_EVM_CHAIN_ID;
  const observedChainId = evmSnapshot?.chainIdDecimal ?? evmSnapshot?.chainId ?? null;
  const matches =
    evmSnapshot?.status === 'VERIFIED'
      ? evmSnapshot.chainIdDecimal === expectedChainId
      : evmSnapshot?.status === 'FAILED'
        ? false
        : null;

  // Matching chain IDs do not prove the endpoints are the same network.
  const crossInterfaceEquivalence: CrossInterfaceEquivalenceStatus = 'INCONCLUSIVE';

  const hasFailed = substrateStatus === 'FAILED' || evmStatus === 'FAILED';
  const hasUnavailable = substrateStatus === 'UNAVAILABLE' || evmStatus === 'UNAVAILABLE';
  const hasIncomplete = substrateStatus === 'INCONCLUSIVE' || evmStatus === 'INCONCLUSIVE';
  const overallStatus: DualInterfaceStatus = hasFailed
    ? 'FAILED'
    : hasUnavailable
      ? 'UNAVAILABLE'
      : hasIncomplete
        ? 'INCONCLUSIVE'
        : 'INCONCLUSIVE';

  const limitations = [
    'Substrate and EVM identities are evaluated independently.',
    'Matching EVM chain IDs do not prove that both endpoints belong to the same network.',
    'Substrate genesis hash and EVM genesis block hash are not compared as equivalent values.',
    'No documented cross-interface equivalence exists; cross-interface equivalence is INCONCLUSIVE.',
  ];

  const evidence =
    `substrateStatus=${substrateStatus}; evmStatus=${evmStatus}; ` +
    `evmChainId=${observedChainId ?? 'unavailable'}; expectedEvmChainId=${expectedChainId}; ` +
    `substrateGenesisHash=${substrateSnapshot?.genesisHash ?? 'unavailable'}; ` +
    `evmGenesisBlockHash=${evmSnapshot?.genesisBlockHash ?? 'unavailable'}; ` +
    `crossInterfaceEquivalence=${crossInterfaceEquivalence}`;

  return {
    overallStatus,
    substrateStatus,
    evmStatus,
    evmChainIdComparison: {
      expected: expectedChainId,
      observed: observedChainId,
      matches,
    },
    substrateGenesisHash: substrateSnapshot?.genesisHash ?? null,
    evmGenesisBlockHash: evmSnapshot?.genesisBlockHash ?? null,
    crossInterfaceEquivalence,
    evidence,
    limitations,
    observedAt,
  };
}
