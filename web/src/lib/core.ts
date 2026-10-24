/**
 * ChainRelay Web — core adapter.
 *
 * The ChainRelay CLI core lives in the repository root (`../src`) and is
 * CommonJS. It contains only pure logic (no Node built-ins), so it is safe to
 * run in a browser and is reused here rather than re-implemented. That keeps
 * the dashboard and the `chainrelay` CLI in exact agreement on validation,
 * account normalization, fee estimation and preflight behaviour.
 *
 * This module is the ONLY place that touches the root sources. Everything else
 * in the web app consumes the typed re-exports below.
 */

import amountModule from '../../../src/amount.js';
import intentModule from '../../../src/intent.js';
import executorModule from '../../../src/executor.js';
import preflightModule from '../../../src/preflight.js';
import receiptModule from '../../../src/receipt.js';

export const toBaseUnits = amountModule.toBaseUnits as (
  amount: string,
  decimals?: number,
) => bigint;

export const SUPPORTED_ACTIONS = intentModule.SUPPORTED_ACTIONS as {
  readonly TRANSFER: 'transfer';
  readonly TRANSFER_KEEP_ALIVE: 'transferKeepAlive';
  readonly TRANSFER_ALL: 'transferAll';
};

export const SUPPORTED_ASSETS = intentModule.SUPPORTED_ASSETS as {
  readonly POT: 'POT';
};

export const validateIntent = intentModule.validateIntent as (intent: {
  action?: string;
  asset?: string;
  amount?: string;
  recipient?: string;
  signer?: string;
  deadline?: number;
  intentId?: string;
}) => { valid: boolean; errors: string[] };

export const isValidSS58 = intentModule.isValidSS58 as (address: unknown) => boolean;

export interface NormalizedAccount {
  address: string;
  free: string | null;
  reserved: string | null;
  miscFrozen: string | null;
  feeFrozen: string | null;
  frozen: string | null;
  flags: string | null;
  frozenBreakdownKnown: boolean;
}

export const inspectAccounts = executorModule.inspectAccounts as (
  intent: { signer: string; recipient: string },
  api: unknown,
) => Promise<{ signer: NormalizedAccount; recipient: NormalizedAccount }>;

export interface ConstructedCall {
  action: string;
  pallet: string;
  method: string;
  recipient: string;
  amount: string | null;
  keepAlive: boolean | null;
  call: {
    toHex: () => string;
    method?: { section: string; method: string };
    args?: unknown[];
  };
}

export const constructTransferCall = executorModule.constructTransferCall as (
  intent: { action: string; recipient: string; amount?: string },
  api: unknown,
) => ConstructedCall;

export interface FeeEstimate {
  signerAddress: string;
  partialFee: string;
  weight: string;
  class: string | null;
  paysFee: string | null;
  isEstimate: boolean;
  method: string;
}

export const estimateCallFee = executorModule.estimateCallFee as (
  call: unknown,
  signerAddress: string,
  api: unknown,
) => Promise<FeeEstimate>;

export interface DryRunResult {
  signerAddress: string;
  blockHash: string;
  rpcOk: boolean;
  dispatchOk: boolean;
  dispatchError?: string;
  dispatchResult?: unknown;
  error?: string;
  isEstimate: boolean;
  method: string;
}

export const dryRunCall = executorModule.dryRunCall as (
  call: unknown,
  signerAddress: string,
  api: unknown,
) => Promise<DryRunResult>;

export const SPENDABILITY = preflightModule.SPENDABILITY as {
  readonly SUFFICIENT: 'SUFFICIENT';
  readonly INSUFFICIENT: 'INSUFFICIENT';
  readonly UNKNOWN: 'UNKNOWN';
};

export interface PreflightResult {
  ok: boolean;
  checks: {
    recipient?: {
      exists: boolean | null;
      account: unknown;
      inconclusive: boolean;
      reason: string | null;
    };
    senderBalance?: {
      spendability: string;
      senderBalance: Record<string, string | null | boolean>;
      required: string | null;
      available: string;
      feeOnly: boolean;
      warnings: string[];
    };
  };
  errors: string[];
  warnings: string[];
}

export const runPreflightChecks = preflightModule.runPreflightChecks as (
  params: { intent: unknown; feeEstimate: unknown; accounts?: unknown },
  api: unknown,
) => Promise<PreflightResult>;

export const validateAccountSnapshot = preflightModule.validateAccountSnapshot as (
  account: unknown,
  label: string,
) => { valid: boolean; data: Record<string, unknown> | null; error: string | null };

export const createExecutionReceipt = receiptModule.createExecutionReceipt as (params: {
  intent: unknown;
  callDescription?: unknown;
  feeEstimate?: unknown;
  dryRunResult?: unknown;
  preflight?: unknown;
}) => Record<string, unknown>;
