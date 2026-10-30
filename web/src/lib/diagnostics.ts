import type { TransactionReadinessPassport, PassportCheck } from './passport';

export type DiagnosticSeverity = 'confirmed' | 'warning' | 'inconclusive' | 'unavailable' | 'untested';

export interface DiagnosticFinding {
  code: string;
  category: string;
  status: TransactionReadinessPassport['checks'][number]['status'];
  severity: DiagnosticSeverity;
  title: string;
  explanation: string;
  whyItMatters: string;
  evidence: string | null;
  timestamp: number | null;
  relatedCheck: string;
  suggestedAction: string | null;
}

const SEVERITY_BY_STATUS: Record<TransactionReadinessPassport['checks'][number]['status'], DiagnosticSeverity> = {
  VERIFIED: 'confirmed',
  FAILED: 'confirmed',
  WARNING: 'warning',
  INCONCLUSIVE: 'inconclusive',
  UNAVAILABLE: 'unavailable',
  NOT_TESTED: 'untested',
};

function finding(
  code: string,
  category: string,
  check: PassportCheck,
  title: string,
  explanation: string,
  whyItMatters: string,
  suggestedAction: string | null,
  evidence: string | null = check.evidence ?? null,
  timestamp: number | null = check.timestamp ?? null,
): DiagnosticFinding {
  return {
    code,
    category,
    status: check.status,
    severity: SEVERITY_BY_STATUS[check.status],
    title,
    explanation,
    whyItMatters,
    evidence,
    timestamp,
    relatedCheck: check.name,
    suggestedAction,
  };
}

function incompleteCheckNames(passport: TransactionReadinessPassport): string[] {
  return passport.checks
    .filter((check) => ['WARNING', 'INCONCLUSIVE', 'UNAVAILABLE', 'NOT_TESTED'].includes(check.status))
    .map((check) => check.name);
}

export function deriveDiagnostics(passport: TransactionReadinessPassport): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const walletUnavailable = passport.checks.some(
    (check) => check.name === 'Wallet connection' && (check.status === 'FAILED' || check.status === 'UNAVAILABLE'),
  );

  for (const check of passport.checks) {
    switch (check.name) {
      case 'Network identity':
        if (check.status === 'FAILED') {
          findings.push(
            finding(
              'NETWORK_IDENTITY_MISMATCH',
              'network',
              check,
              'Network identity mismatch',
              `The live genesis hash (${passport.network.genesisHash ?? 'unavailable'}) does not match the expected genesis hash (${passport.network.expectedGenesisHash ?? 'unavailable'}).`,
              'A mismatched network can invalidate every subsequent balance, fee, and simulation result.',
              'Verify the configured endpoint and expected network identity, then reconnect and re-run all diagnostics.',
              `observed=${passport.network.genesisHash ?? 'unavailable'}; expected=${passport.network.expectedGenesisHash ?? 'unavailable'}`,
            ),
          );
        } else if (check.status === 'UNAVAILABLE' || check.status === 'INCONCLUSIVE') {
          findings.push(
            finding(
              'RUNTIME_METADATA_UNAVAILABLE',
              'network',
              check,
              'Runtime metadata unavailable',
              'Runtime verification could not be completed because the node did not provide enough network identity information.',
              'Without verified network identity, balances, fees, and simulations cannot be trusted.',
              'Restore the node connection and re-run the readiness check.',
            ),
          );
        }
        break;

      case 'Wallet connection':
        if (check.status === 'FAILED' || check.status === 'UNAVAILABLE') {
          findings.push(
            finding(
              'WALLET_UNAVAILABLE',
              'wallet',
              check,
              'Wallet unavailable',
              check.status === 'FAILED'
                ? 'The wallet connection or selected account failed validation.'
                : 'No wallet account is connected for this diagnostic run.',
              'Account-specific balance and sufficiency checks cannot be performed without a connected account.',
              'Connect a wallet account, or continue with address-only diagnostics where supported.',
            ),
          );
        }
        break;

      case 'Balance read':
        if (check.status === 'UNAVAILABLE' && !walletUnavailable) {
          findings.push(
            finding(
              'WALLET_UNAVAILABLE',
              'wallet',
              check,
              'Balance read unavailable',
              'The sender balance could not be read from the node even though wallet connection was not reported as unavailable.',
              'Balance sufficiency cannot be verified without a readable balance.',
              'Refresh the balance after confirming the node connection and account address.',
            ),
          );
        }
        break;

      case 'Fee estimate':
        if (check.status === 'UNAVAILABLE') {
          findings.push(
            finding(
              'FEE_ESTIMATION_UNAVAILABLE',
              'fee',
              check,
              'Fee estimate unavailable',
              'No fee estimate is available, so the total required funds cannot be verified.',
              'Balance sufficiency cannot be verified without an estimated fee.',
              'Re-run fee estimation after call construction and node connection succeed.',
            ),
          );
        } else if (check.status === 'FAILED') {
          findings.push(
            finding(
              'FEE_ESTIMATION_UNAVAILABLE',
              'fee',
              check,
              'Fee estimation failed',
              'Fee estimation failed for the proposed call.',
              'Balance sufficiency cannot be verified without a reliable fee estimate.',
              'Review the fee estimation error and construction inputs, then re-run the diagnostic.',
            ),
          );
        }
        break;

      case 'Balance sufficiency':
        if (check.status === 'FAILED') {
          const available = passport.balance.availableBaseUnits ?? 'unavailable';
          const required =
            passport.transaction.amountBaseUnits && passport.fee.partialFeeBaseUnits
              ? `${passport.transaction.amountBaseUnits} + ${passport.fee.partialFeeBaseUnits}`
              : 'unavailable';
          findings.push(
            finding(
              'INSUFFICIENT_BALANCE',
              'balance',
              check,
              'Insufficient available balance',
              `The available balance (${available} base units) does not cover the required amount plus estimated fee (${required} base units).`,
              'Submitting a transfer with insufficient available funds would fail before dispatch.',
              'Reduce the amount or fee, or fund the account, then re-run the diagnostic.',
              `available=${available}; required=${required}`,
            ),
          );
        }
        break;

      case 'Unsigned dry-run':
        if (check.status === 'FAILED') {
          findings.push(
            finding(
              'SIMULATION_FAILURE',
              'simulation',
              check,
              'Simulation failed',
              `The unsigned dry-run failed or was rejected by the runtime. Evidence: ${check.evidence ?? 'unavailable'}.`,
              'This may indicate a runtime-level problem with the proposed call, but the unsigned result does not establish the signed outcome.',
              'Review the reported simulation evidence and construction inputs before any signing attempt.',
            ),
          );
        } else if (check.status === 'INCONCLUSIVE' || check.status === 'WARNING') {
          if (String(check.evidence ?? '').includes('BadOrigin')) {
            findings.push(
              finding(
                'UNSIGNED_BAD_ORIGIN',
                'simulation',
                check,
                'Unsigned simulation is inconclusive',
                'The unsigned dry-run returned BadOrigin. This is expected for an unsigned extrinsic and does not establish whether a properly signed transfer would succeed.',
                'BadOrigin from an unsigned simulation is an origin limitation, not proof of a signed execution failure.',
                'Treat this result as inconclusive until Portaldot documents wallet compatibility.',
              ),
            );
          }
        }
        break;

      case 'Dual-interface identity':
        if (check.status === 'FAILED') {
          findings.push(finding('EVM_CHAIN_ID_MISMATCH', 'network', check, 'EVM chain ID mismatch', 'The configured EVM endpoint returned a chain ID that differs from the expected EVM chain ID.', 'EVM identity cannot be trusted for this network.', 'Verify VITE_PORTALDOT_EVM_RPC_URL and the expected EVM chain ID.'));
        } else if (check.status === 'UNAVAILABLE') {
          findings.push(finding('EVM_ENDPOINT_UNAVAILABLE', 'network', check, 'EVM endpoint unavailable', 'No usable EVM identity evidence is available.', 'Dual-interface verification cannot be completed without EVM evidence.', 'Configure a verified EVM RPC endpoint or leave EVM checks unrun.'));
        } else if (check.status === 'INCONCLUSIVE') {
          findings.push(finding('CROSS_INTERFACE_EQUIVALENCE_UNCONFIRMED', 'network', check, 'Cross-interface equivalence unconfirmed', 'EVM identity may be verified, but no documented cross-interface equivalence exists.', 'Matching or differing genesis hashes must not be interpreted as proof of sameness.', 'Treat cross-interface equivalence as inconclusive until documented by Portaldot.'));
        }
        break;

      case 'Signing compatibility':
        if (check.status === 'NOT_TESTED') {
          findings.push(
            finding(
              'SIGNING_COMPATIBILITY_UNVERIFIED',
              'signing',
              check,
              'Signing compatibility unverified',
              'Portaldot custom signed extensions remain unverified; only signer interface presence was checked.',
              'A successful readiness check does not prove that the wallet can sign this runtime transaction.',
              'Do not sign or submit. Wait for official Portaldot extension documentation before attempting compatibility testing.',
            ),
          );
        }
        break;
        if (check.status === 'NOT_TESTED') {
          findings.push(
            finding(
              'SIGNING_COMPATIBILITY_UNVERIFIED',
              'signing',
              check,
              'Signing compatibility unverified',
              'Portaldot custom signed extensions remain unverified; only signer interface presence was checked.',
              'A successful readiness check does not prove that the wallet can sign this runtime transaction.',
              'Do not sign or submit. Wait for official Portaldot extension documentation before attempting compatibility testing.',
            ),
          );
        }
        break;

      default:
        break;
    }
  }

  const incompleteChecks = incompleteCheckNames(passport);
  if (incompleteChecks.length > 0) {
    findings.push({
      code: 'INCOMPLETE_EVIDENCE',
      category: 'evidence',
      status: 'INCONCLUSIVE',
      severity: 'inconclusive',
      title: 'Incomplete diagnostic evidence',
      explanation: `Incomplete checks: ${incompleteChecks.join(', ')}.`,
      whyItMatters: 'The passport cannot support a positive readiness conclusion while evidence is missing or unverified.',
      evidence: incompleteChecks.join(', '),
      timestamp: passport.generatedAtEpochMs,
      relatedCheck: 'Transaction Readiness Passport',
      suggestedAction: 'Complete or refresh the listed checks before relying on this passport.',
    });
  }

  return findings;
}
