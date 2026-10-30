import type { TransactionReadinessPassport } from './passport';

export type EvidenceCategory =
  | 'Network'
  | 'Account'
  | 'Transaction'
  | 'Fee'
  | 'Balance'
  | 'Simulation'
  | 'EVM'
  | 'Dual-interface'
  | 'Diagnostics'
  | 'Timestamps';

export type EvidenceType = 'OBSERVED' | 'DERIVED' | 'EXPLANATION';

export interface EvidenceItem {
  id: string;
  category: EvidenceCategory;
  label: string;
  value: string | null;
  status: TransactionReadinessPassport['checks'][number]['status'];
  provenance: string;
  explanation: string;
  type: EvidenceType;
  observedAt?: number | null;
}

export function buildEvidenceIndex(passport: TransactionReadinessPassport): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const networkCheck = passport.checks.find((check) => check.name === 'Network identity');
  const walletCheck = passport.checks.find((check) => check.name === 'Wallet connection');
  const balanceCheck = passport.checks.find((check) => check.name === 'Balance read');
  const feeCheck = passport.checks.find((check) => check.name === 'Fee estimate');
  const sufficiencyCheck = passport.checks.find((check) => check.name === 'Balance sufficiency');
  const simulationCheck = passport.checks.find((check) => check.name === 'Unsigned dry-run');
  const dualCheck = passport.checks.find((check) => check.name === 'Dual-interface identity');

  items.push({ id: 'network.name', category: 'Network', label: 'Network name', value: passport.network.name, status: networkCheck?.status ?? (passport.network.name ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.network.name', explanation: 'Observed network name from the connected Substrate node.', type: 'OBSERVED', observedAt: networkCheck?.timestamp ?? null });
  items.push({ id: 'network.genesisHash', category: 'Network', label: 'Substrate genesis hash', value: passport.network.genesisHash, status: networkCheck?.status ?? (passport.network.genesisHash ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.network.genesisHash', explanation: 'Observed genesis hash from the connected Substrate node.', type: 'OBSERVED', observedAt: networkCheck?.timestamp ?? null });
  items.push({ id: 'network.specName', category: 'Network', label: 'Spec name', value: passport.network.specName, status: networkCheck?.status ?? (passport.network.specName ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.network.specName', explanation: 'Observed runtime spec name.', type: 'OBSERVED', observedAt: networkCheck?.timestamp ?? null });
  items.push({ id: 'network.specVersion', category: 'Network', label: 'Spec version', value: passport.network.specVersion, status: networkCheck?.status ?? (passport.network.specVersion ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.network.specVersion', explanation: 'Observed runtime spec version.', type: 'OBSERVED', observedAt: networkCheck?.timestamp ?? null });
  items.push({ id: 'network.transactionVersion', category: 'Network', label: 'Transaction version', value: passport.network.transactionVersion, status: networkCheck?.status ?? (passport.network.transactionVersion ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.network.transactionVersion', explanation: 'Observed runtime transaction version.', type: 'OBSERVED', observedAt: networkCheck?.timestamp ?? null });
  items.push({ id: 'network.tokenDecimals', category: 'Network', label: 'Token decimals', value: passport.network.tokenDecimals === null ? null : String(passport.network.tokenDecimals), status: networkCheck?.status ?? (passport.network.tokenDecimals !== null ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.network.tokenDecimals', explanation: 'Observed token decimals.', type: 'OBSERVED', observedAt: networkCheck?.timestamp ?? null });
  items.push({ id: 'network.expectedGenesisHash', category: 'Network', label: 'Expected genesis hash', value: passport.network.expectedGenesisHash,   status: 'VERIFIED', provenance: 'passport.network.expectedGenesisHash', explanation: 'Configured expected genesis hash used for comparison.', type: 'OBSERVED', observedAt: networkCheck?.timestamp ?? null });
  items.push({ id: 'network.identityVerified', category: 'Network', label: 'Network identity verified', value: String(passport.network.networkIdentityVerified), status: networkCheck?.status ?? (passport.network.networkIdentityVerified ? 'VERIFIED' : 'FAILED'), provenance: 'passport.network.networkIdentityVerified', explanation: 'Derived comparison between observed and expected genesis hashes.', type: 'DERIVED', observedAt: networkCheck?.timestamp ?? null });

  items.push({ id: 'account.walletConnected', category: 'Account', label: 'Wallet connected', value: String(passport.account.walletConnected), status: walletCheck?.status ?? (passport.account.walletConnected ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.account.walletConnected', explanation: 'Observed wallet connection state.', type: 'OBSERVED', observedAt: walletCheck?.timestamp ?? null });
  items.push({ id: 'account.address', category: 'Account', label: 'Wallet address', value: passport.account.address, status: walletCheck?.status ?? (passport.account.address ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.account.address', explanation: 'Address redaction follows the existing Passport behavior.', type: 'OBSERVED', observedAt: walletCheck?.timestamp ?? null });

  items.push({ id: 'transaction.recipient', category: 'Transaction', label: 'Recipient', value: passport.transaction.recipient, status: passport.transaction.recipient ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.transaction.recipient', explanation: 'Observed or redacted transaction recipient.', type: 'OBSERVED', observedAt: null });
  items.push({ id: 'transaction.amountDecimal', category: 'Transaction', label: 'Amount (decimal)', value: passport.transaction.amountDecimal, status: passport.transaction.amountDecimal ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.transaction.amountDecimal', explanation: 'Observed transaction amount in decimal units.', type: 'OBSERVED', observedAt: null });
  items.push({ id: 'transaction.amountBaseUnits', category: 'Transaction', label: 'Amount (base units)', value: passport.transaction.amountBaseUnits, status: passport.transaction.amountBaseUnits ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.transaction.amountBaseUnits', explanation: 'Observed transaction amount in base units.', type: 'OBSERVED', observedAt: null });
  items.push({ id: 'transaction.callSection', category: 'Transaction', label: 'Call section', value: passport.transaction.callSection, status: passport.transaction.callSection ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.transaction.callSection', explanation: 'Observed call section.', type: 'OBSERVED', observedAt: null });
  items.push({ id: 'transaction.callMethod', category: 'Transaction', label: 'Call method', value: passport.transaction.callMethod, status: passport.transaction.callMethod ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.transaction.callMethod', explanation: 'Observed call method.', type: 'OBSERVED', observedAt: null });
  items.push({ id: 'transaction.encodedCall', category: 'Transaction', label: 'Encoded call', value: passport.transaction.encodedCall, status: passport.transaction.encodedCall ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.transaction.encodedCall', explanation: 'Observed encoded call.', type: 'OBSERVED', observedAt: null });

  items.push({ id: 'fee.partialFeeBaseUnits', category: 'Fee', label: 'Partial fee (base units)', value: passport.fee.partialFeeBaseUnits, status: feeCheck?.status ?? (passport.fee.partialFeeBaseUnits ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.fee.partialFeeBaseUnits', explanation: 'Observed fee estimate.', type: 'OBSERVED', observedAt: feeCheck?.timestamp ?? null });
  items.push({ id: 'fee.weight', category: 'Fee', label: 'Weight', value: passport.fee.weight, status: feeCheck?.status ?? (passport.fee.weight ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.fee.weight', explanation: 'Observed transaction weight.', type: 'OBSERVED', observedAt: feeCheck?.timestamp ?? null });
  items.push({ id: 'fee.method', category: 'Fee', label: 'Fee method', value: passport.fee.method, status: feeCheck?.status ?? (passport.fee.method ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.fee.method', explanation: 'Observed fee estimation method.', type: 'OBSERVED', observedAt: feeCheck?.timestamp ?? null });

  items.push({ id: 'balance.availableBaseUnits', category: 'Balance', label: 'Available balance (base units)', value: passport.balance.availableBaseUnits, status: balanceCheck?.status ?? (passport.balance.availableBaseUnits ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.balance.availableBaseUnits', explanation: 'Derived available balance after frozen amounts.', type: 'DERIVED', observedAt: balanceCheck?.timestamp ?? null });
  items.push({ id: 'balance.estimatedRemainingBaseUnits', category: 'Balance', label: 'Estimated remaining (base units)', value: passport.balance.estimatedRemainingBaseUnits, status: sufficiencyCheck?.status ?? (passport.balance.estimatedRemainingBaseUnits ? 'VERIFIED' : 'UNAVAILABLE'), provenance: 'passport.balance.estimatedRemainingBaseUnits', explanation: 'Derived remaining balance after amount and fee.', type: 'DERIVED', observedAt: sufficiencyCheck?.timestamp ?? null });
  items.push({ id: 'balance.sufficient', category: 'Balance', label: 'Balance sufficient', value: passport.balance.sufficient === null ? null : String(passport.balance.sufficient), status: sufficiencyCheck?.status ?? (passport.balance.sufficient === null ? 'UNAVAILABLE' : passport.balance.sufficient ? 'VERIFIED' : 'FAILED'), provenance: 'passport.balance.sufficient', explanation: 'Derived balance sufficiency result.', type: 'DERIVED', observedAt: sufficiencyCheck?.timestamp ?? null });

  items.push({ id: 'simulation.status', category: 'Simulation', label: 'Unsigned dry-run status', value: passport.checks.find((c) => c.name === 'Unsigned dry-run')?.status ?? null, status: simulationCheck?.status ?? 'UNAVAILABLE', provenance: 'passport.checks[Unsigned dry-run].status', explanation: 'Observed unsigned dry-run result.', type: 'OBSERVED', observedAt: simulationCheck?.timestamp ?? null });
  items.push({ id: 'simulation.evidence', category: 'Simulation', label: 'Simulation evidence', value: simulationCheck?.evidence ?? null, status: simulationCheck?.status ?? 'UNAVAILABLE', provenance: 'passport.checks[Unsigned dry-run].evidence', explanation: 'Observed simulation evidence.', type: 'OBSERVED', observedAt: simulationCheck?.timestamp ?? null });

  const dual = passport.dualInterface;
  items.push({ id: 'evm.status', category: 'EVM', label: 'EVM identity status', value: dual?.evmStatus ?? null, status: (dual?.evmStatus as TransactionReadinessPassport['checks'][number]['status']) ?? 'UNAVAILABLE', provenance: 'passport.dualInterface.evmStatus', explanation: 'EVM identity status from the dual-interface comparison.', type: 'OBSERVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });
  items.push({ id: 'evm.chainId', category: 'EVM', label: 'EVM chain ID', value: dual?.evmChainId ?? null, status: dual?.evmStatus === 'VERIFIED' ? 'VERIFIED' : dual?.evmStatus === 'FAILED' ? 'FAILED' : 'UNAVAILABLE', provenance: 'passport.dualInterface.evmChainId', explanation: 'Observed EVM chain ID.', type: 'OBSERVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });
  items.push({ id: 'evm.genesisBlockHash', category: 'EVM', label: 'EVM genesis block hash', value: dual?.evmGenesisBlockHash ?? null, status: dual?.evmGenesisBlockHash ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.dualInterface.evmGenesisBlockHash', explanation: 'Observed EVM genesis block hash.', type: 'OBSERVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });

  items.push({ id: 'dual.substrateStatus', category: 'Dual-interface', label: 'Substrate identity status', value: dual?.substrateStatus ?? null, status: (dual?.substrateStatus as TransactionReadinessPassport['checks'][number]['status']) ?? 'UNAVAILABLE', provenance: 'passport.dualInterface.substrateStatus', explanation: 'Substrate identity status from the dual-interface comparison.', type: 'OBSERVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });
  items.push({ id: 'dual.evmStatus', category: 'Dual-interface', label: 'EVM identity status', value: dual?.evmStatus ?? null, status: (dual?.evmStatus as TransactionReadinessPassport['checks'][number]['status']) ?? 'UNAVAILABLE', provenance: 'passport.dualInterface.evmStatus', explanation: 'EVM identity status from the dual-interface comparison.', type: 'OBSERVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });
  items.push({ id: 'dual.crossInterfaceEquivalence', category: 'Dual-interface', label: 'Cross-interface equivalence', value: dual?.crossInterfaceEquivalence ?? 'INCONCLUSIVE', status: 'INCONCLUSIVE', provenance: 'passport.dualInterface.crossInterfaceEquivalence', explanation: 'Cross-interface equivalence remains inconclusive without documented equivalence.', type: 'DERIVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });
  items.push({ id: 'dual.substrateGenesisHash', category: 'Dual-interface', label: 'Substrate genesis hash', value: dual?.substrateGenesisHash ?? null, status: dual?.substrateGenesisHash ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.dualInterface.substrateGenesisHash', explanation: 'Observed Substrate genesis hash.', type: 'OBSERVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });
  items.push({ id: 'dual.evmGenesisBlockHash', category: 'Dual-interface', label: 'EVM genesis block hash', value: dual?.evmGenesisBlockHash ?? null, status: dual?.evmGenesisBlockHash ? 'VERIFIED' : 'UNAVAILABLE', provenance: 'passport.dualInterface.evmGenesisBlockHash', explanation: 'Observed EVM genesis block hash.', type: 'OBSERVED', observedAt: dualCheck?.timestamp ?? passport.generatedAtEpochMs });

  for (const finding of passport.diagnostics) {
    items.push({ id: `diagnostics.${finding.code}`, category: 'Diagnostics', label: finding.title, value: finding.evidence, status: finding.status, provenance: `passport.diagnostics[${finding.code}].relatedCheck=${finding.relatedCheck}`, explanation: finding.explanation, type: 'EXPLANATION', observedAt: finding.timestamp });
  }

  items.push({ id: 'timestamps.generatedAt', category: 'Timestamps', label: 'Passport generated at (epoch ms)', value: String(passport.generatedAtEpochMs), status: 'VERIFIED', provenance: 'passport.generatedAtEpochMs', explanation: 'Timestamp when the Passport was generated.', type: 'OBSERVED', observedAt: passport.generatedAtEpochMs });
  items.push({ id: 'timestamps.generatedAtUtc', category: 'Timestamps', label: 'Passport generated at (UTC)', value: passport.generatedAtUtc, status: 'VERIFIED', provenance: 'passport.generatedAtUtc', explanation: 'UTC timestamp when the Passport was generated.', type: 'OBSERVED', observedAt: passport.generatedAtEpochMs });

  return items;
}
