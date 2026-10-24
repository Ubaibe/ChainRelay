/**
 * ChainRelay Web â€” live readiness assessment.
 *
 * This orchestrates read-only checks against the connected node using the same
 * ChainRelay core the CLI uses (validation, account normalization, fee
 * estimation, preflight). Nothing is signed, broadcast or submitted.
 */

import type { ApiPromise } from '@polkadot/api';
import { checkAddress } from '@polkadot/util-crypto';

import {
  SUPPORTED_ACTIONS,
  SUPPORTED_ASSETS,
  constructTransferCall,
  dryRunCall,
  estimateCallFee,
  inspectAccounts,
  runPreflightChecks,
  toBaseUnits,
  validateIntent,
  type DryRunResult,
  type FeeEstimate,
  type NormalizedAccount,
} from './core';

export type CheckStatus = 'PASS' | 'WARNING' | 'ERROR' | 'NOT_CHECKED';

export interface SectionStatus {
  status: CheckStatus;
  headline: string;
  details: string[];
}

export interface ReadinessResult {
  startedAt: number;
  finishedAt: number;
  validation: SectionStatus & { errors: string[] };
  account: SectionStatus & {
    signer: NormalizedAccount | null;
    recipient: NormalizedAccount | null;
  };
  construct: SectionStatus;
  fee: SectionStatus & { estimate: FeeEstimate | null };
  readiness: SectionStatus;
  simulation: SectionStatus & { result: DryRunResult | null };
  warnings: string[];
  preview: {
    pallet: string;
    method: string;
    recipient: string;
    amountBaseUnits: string;
    callHex: string;
  } | null;
}

export interface ReadinessInput {
  sender: string;
  recipient: string;
  amount: string;
  ss58Prefix: number | null;
}

const ACTION = SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE;
const ASSET = SUPPORTED_ASSETS.POT;

function statusForSpendability(spendability: string | undefined): CheckStatus {
  if (spendability === 'SUFFICIENT') {
    return 'PASS';
  }
  if (spendability === 'INSUFFICIENT') {
    return 'ERROR';
  }
  return 'WARNING';
}

/**
 * Local, offline validation of the inputs. No RPC is involved here, and the
 * result is reported separately from live chain data.
 */
export function validateInputs(input: ReadinessInput): {
  valid: boolean;
  errors: string[];
  notes: string[];
  intent: {
    action: string;
    asset: string;
    amount: string;
    recipient: string;
    signer: string;
  } | null;
} {
  const errors: string[] = [];
  const notes: string[] = [];

  const intent = {
    action: ACTION,
    asset: ASSET,
    amount: input.amount,
    recipient: input.recipient,
    signer: input.sender,
  };

  const result = validateIntent(intent);
  errors.push(...result.errors);

  // Address prefix check against the connected network (when known).
  if (input.ss58Prefix !== null) {
    for (const [label, address] of [
      ['Sender', input.sender],
      ['Recipient', input.recipient],
    ] as const) {
      if (!address) {
        continue;
      }
      const [ok, reason] = checkAddress(address, input.ss58Prefix);
      if (!ok) {
        errors.push(
          `${label} address is not valid for SS58 prefix ${input.ss58Prefix}: ${reason ?? 'invalid address'}`,
        );
      }
    }
  }

  if (
    input.sender &&
    input.recipient &&
    input.sender === input.recipient &&
    !errors.length
  ) {
    notes.push(
      'Sender and recipient are the same address; the transfer would be a self-transfer.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    notes,
    intent: errors.length === 0 ? intent : null,
  };
}

/**
 * Run the full read-only readiness check against the connected node.
 */
export async function runReadinessCheck(
  api: ApiPromise,
  input: ReadinessInput,
): Promise<ReadinessResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];

  const validation = validateInputs(input);

  if (!validation.valid || !validation.intent) {
    const now = Date.now();
    return {
      startedAt,
      finishedAt: now,
      validation: {
        status: 'ERROR',
        headline: 'Inputs are not valid, so no live check was performed.',
        details: validation.errors,
        errors: validation.errors,
      },
      account: {
        status: 'NOT_CHECKED',
        headline: 'Not checked: the inputs were rejected before any RPC call.',
        details: [],
        signer: null,
        recipient: null,
      },
      construct: {
        status: 'NOT_CHECKED',
        headline: 'Not checked: the inputs were rejected before any RPC call.',
        details: [],
      },
      fee: {
        status: 'NOT_CHECKED',
        headline: 'Not checked: the inputs were rejected before any RPC call.',
        details: [],
        estimate: null,
      },
      readiness: {
        status: 'NOT_CHECKED',
        headline: 'Not checked: fix the input errors first.',
        details: [],
      },
      simulation: {
        status: 'NOT_CHECKED',
        headline: 'Not checked: the inputs were rejected before any RPC call.',
        details: [],
        result: null,
      },
      warnings: validation.notes,
      preview: null,
    };
  }

  warnings.push(...validation.notes);

  const intent = validation.intent;

  // --- Account inspection (live) -------------------------------------------
  let signer: NormalizedAccount | null = null;
  let recipient: NormalizedAccount | null = null;
  let accountStatus: CheckStatus = 'PASS';
  let accountHeadline = 'Sender and recipient accounts were read from the node.';
  const accountDetails: string[] = [];

  try {
    const accounts = await inspectAccounts(
      { signer: intent.signer, recipient: intent.recipient },
      api,
    );
    signer = accounts.signer;
    recipient = accounts.recipient;

    if (!signer.frozenBreakdownKnown) {
      accountStatus = 'WARNING';
      accountHeadline =
        'Accounts were read, but the frozen-balance breakdown is not exposed by this runtime.';
      accountDetails.push(
        'The runtime reports a single `frozen` value, so the split between miscFrozen and feeFrozen is unknown.',
      );
      warnings.push(
        'Frozen balance breakdown is not available on this runtime; spendable balance is a conservative estimate.',
      );
    }
  } catch (err) {
    accountStatus = 'ERROR';
    accountHeadline = 'Account inspection failed.';
    accountDetails.push(err instanceof Error ? err.message : String(err));
  }

  // --- Call construction (no signing) --------------------------------------
  let callDescription: ReturnType<typeof constructTransferCall> | null = null;
  let preview: ReadinessResult['preview'] = null;
  let constructError: string | null = null;

  try {
    callDescription = constructTransferCall(intent, api);
    preview = {
      pallet: callDescription.pallet,
      method: callDescription.method,
      recipient: callDescription.recipient,
      amountBaseUnits: callDescription.amount ?? '0',
      callHex: callDescription.call.toHex(),
    };
  } catch (err) {
    constructError = err instanceof Error ? err.message : String(err);
    warnings.push(`Call construction failed: ${constructError}`);
  }

  const construct: SectionStatus = constructError
    ? {
        status: 'ERROR',
        headline: 'The transfer call could not be constructed.',
        details: [constructError],
      }
    : {
        status: 'PASS',
        headline: `Built a ${callDescription?.pallet}.${callDescription?.method} call from the validated inputs.`,
        details: [
          'The call was assembled for inspection only. It was not signed and not submitted.',
        ],
      };

  // --- Fee estimation (live, read-only) -----------------------------------
  let feeEstimate: FeeEstimate | null = null;
  let feeStatus: CheckStatus = 'NOT_CHECKED';
  let feeHeadline = 'Not checked: no call could be constructed.';
  const feeDetails: string[] = [];

  if (callDescription) {
    try {
      feeEstimate = await estimateCallFee(
        callDescription.call,
        intent.signer,
        api,
      );
      feeStatus = 'PASS';
      feeHeadline = `Fee estimated via ${feeEstimate.method}. This is an estimate, not the amount that will be charged.`;
      feeDetails.push(`Estimated partial fee: ${feeEstimate.partialFee} base units.`);
      feeDetails.push(`Dispatch class: ${feeEstimate.class ?? 'unavailable'}.`);
      feeDetails.push(`Pays fee: ${feeEstimate.paysFee ?? 'not reported by the runtime'}.`);
    } catch (err) {
      feeStatus = 'ERROR';
      feeHeadline = 'Fee estimation failed.';
      feeDetails.push(err instanceof Error ? err.message : String(err));
    }
  }

  // --- Preflight (live balances + estimate) --------------------------------
  let readinessStatus: CheckStatus = 'NOT_CHECKED';
  let readinessHeadline = 'Not checked: fee estimation did not complete.';
  const readinessDetails: string[] = [];
  let preflightWarnings: string[] = [];
  let preflightErrors: string[] = [];

  if (feeEstimate && signer && recipient) {
    try {
      const preflight = await runPreflightChecks(
        { intent, feeEstimate, accounts: { signer, recipient } },
        api,
      );
      preflightWarnings = preflight.warnings;
      preflightErrors = preflight.errors;

      const spendability = preflight.checks.senderBalance?.spendability;
      const required = preflight.checks.senderBalance?.required;
      const available = preflight.checks.senderBalance?.available;

      readinessStatus = statusForSpendability(spendability);

      if (readinessStatus === 'PASS') {
        readinessHeadline =
          'The balance appears sufficient for the amount plus the estimated fee.';
      } else if (readinessStatus === 'ERROR') {
        readinessHeadline =
          'The available balance does not cover the amount plus the estimated fee.';
      } else {
        readinessHeadline =
          'Spendability could not be determined from the available account information.';
      }

      if (required && available) {
        readinessDetails.push(`Required (amount + estimated fee): ${required} base units.`);
        readinessDetails.push(`Available for fees: ${available} base units.`);
      }

      for (const error of preflightErrors) {
        readinessDetails.push(error);
      }

      if (preflightWarnings.length > 0) {
        warnings.push(...preflightWarnings);
        if (readinessStatus === 'PASS') {
          readinessStatus = 'WARNING';
          readinessHeadline =
            'The balance appears sufficient, but some assumptions could not be verified.';
        }
      }
    } catch (err) {
      readinessStatus = 'ERROR';
      readinessHeadline = 'Preflight checks failed.';
      readinessDetails.push(err instanceof Error ? err.message : String(err));
    }
  } else if (!feeEstimate) {
    readinessStatus = 'ERROR';
    readinessHeadline = 'Not checked: no fee estimate was available.';
  }

  // --- Dry-run simulation (live, read-only) --------------------------------
  let dryRun: DryRunResult | null = null;
  let simulationStatus: CheckStatus = 'NOT_CHECKED';
  let simulationHeadline = 'Not checked: no call could be constructed.';
  const simulationDetails: string[] = [];

  if (callDescription) {
    try {
      dryRun = await dryRunCall(callDescription.call, intent.signer, api);
      simulationDetails.push(`Dry-run block: ${dryRun.blockHash}.`);

      if (dryRun.rpcOk === false) {
        simulationStatus = 'ERROR';
        simulationHeadline = 'The dry-run RPC call failed.';
        simulationDetails.push(dryRun.error ?? 'Unknown RPC error.');
      } else if (dryRun.dispatchOk === true) {
        simulationStatus = 'PASS';
        simulationHeadline =
          'The runtime simulated the dispatch successfully. This is a simulation, not an executed transaction.';
      } else if (dryRun.dispatchError === 'BadOrigin') {
        simulationStatus = 'WARNING';
        simulationHeadline =
          'The unsigned dry-run returned BadOrigin. This is an unsigned-origin limitation, not evidence that a signed transfer would fail.';
        simulationDetails.push(
          'The call was simulated without a signature, so the runtime rejected the origin. The same call, properly signed, is not proven to fail.',
        );
      } else {
        simulationStatus = 'WARNING';
        simulationHeadline = 'The runtime rejected the unsigned dispatch during simulation.';
        simulationDetails.push(`Dispatch error: ${dryRun.dispatchError ?? 'unknown'}.`);
      }
    } catch (err) {
      simulationStatus = 'NOT_CHECKED';
      simulationHeadline = 'The dry-run could not be performed.';
      simulationDetails.push(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    startedAt,
    finishedAt: Date.now(),
    validation: {
      status: 'PASS',
      headline: 'Local input validation passed (no RPC involved).',
      details: validation.notes,
      errors: [],
    },
    account: {
      status: accountStatus,
      headline: accountHeadline,
      details: accountDetails,
      signer,
      recipient,
    },
    construct,
    fee: {
      status: feeStatus,
      headline: feeHeadline,
      details: feeDetails,
      estimate: feeEstimate,
    },
    readiness: {
      status: readinessStatus,
      headline: readinessHeadline,
      details: readinessDetails,
    },
    simulation: {
      status: simulationStatus,
      headline: simulationHeadline,
      details: simulationDetails,
      result: dryRun,
    },
    warnings,
    preview,
  };
}

/**
 * Exposed for tests: the exact base-unit conversion used by the dashboard.
 */
export function amountToBaseUnits(amount: string): bigint {
  return toBaseUnits(amount, 14);
}

