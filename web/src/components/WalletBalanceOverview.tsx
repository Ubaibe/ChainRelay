import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiPromise } from '@polkadot/api';
import { DataRow, Panel } from './Primitives';
import { abbreviateAddress, formatBaseUnits } from '../lib/format';
import type { ReadinessResult } from '../lib/readiness';

interface BalanceState {
  free: string | null;
  reserved: string | null;
  miscFrozen: string | null;
  feeFrozen: string | null;
  frozen: string | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
}

export function WalletBalanceOverview({
  walletAddress,
  result,
  decimals,
  getApi,
  networkState,
}: {
  walletAddress: string | null;
  result: ReadinessResult | null;
  decimals: number;
  getApi: () => ApiPromise | null;
  networkState: string;
}) {
  const [balance, setBalance] = useState<BalanceState>({
    free: null,
    reserved: null,
    miscFrozen: null,
    feeFrozen: null,
    frozen: null,
    error: null,
    loading: false,
    updatedAt: null,
  });
  const tokenRef = useRef(0);

  const readBalance = useCallback(async () => {
    const token = ++tokenRef.current;
    const isCurrent = () => tokenRef.current === token;

    const api = getApi();
    if (!walletAddress || !api || networkState !== 'connected') {
      if (isCurrent()) {
        setBalance({ free: null, reserved: null, miscFrozen: null, feeFrozen: null, frozen: null, error: null, loading: false, updatedAt: null });
      }
      return;
    }

    setBalance((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const account = await (api.query as any).system.account(walletAddress);
      if (!isCurrent()) return;
      const data = account?.data ?? {};
      const toString = (value: unknown) =>
        value && typeof (value as { toString?: () => string }).toString === 'function'
          ? (value as { toString: () => string }).toString()
          : null;
      setBalance({
        free: toString(data.free),
        reserved: toString(data.reserved),
        miscFrozen: toString(data.miscFrozen),
        feeFrozen: toString(data.feeFrozen),
        frozen: toString(data.frozen),
        error: null,
        loading: false,
        updatedAt: Date.now(),
      });
    } catch (err) {
      if (!isCurrent()) return;
      setBalance({
        free: null,
        reserved: null,
        miscFrozen: null,
        feeFrozen: null,
        frozen: null,
        error: err instanceof Error ? err.message : String(err),
        loading: false,
        updatedAt: null,
      });
    }
  }, [getApi, walletAddress, networkState]);

  useEffect(() => {
    void readBalance();
  }, [readBalance]);

  const amount = result?.preview?.amountBaseUnits ?? null;
  const fee = result?.fee.estimate?.partialFee ?? null;

  const availableBalance = (() => {
    if (!balance.free) return null;
    try {
      const free = BigInt(balance.free);
      if (balance.miscFrozen !== null && balance.feeFrozen !== null) {
        return (free - BigInt(balance.miscFrozen) - BigInt(balance.feeFrozen)).toString();
      }
      if (balance.frozen !== null) {
        return (free - BigInt(balance.frozen)).toString();
      }
      return balance.free;
    } catch {
      return null;
    }
  })();

  let remaining: string | null = null;
  if (availableBalance && amount && fee) {
    try {
      remaining = (BigInt(availableBalance) - BigInt(amount) - BigInt(fee)).toString();
    } catch {
      remaining = null;
    }
  }

  const canVerify = availableBalance !== null && amount !== null && fee !== null;
  const sufficient =
    canVerify && BigInt(availableBalance as string) >= BigInt(amount as string) + BigInt(fee as string);

  return (
    <Panel title="Wallet balance overview" subtitle="Read-only values from the connected account.">
      <DataRow label="Account" value={walletAddress ? abbreviateAddress(walletAddress) : 'Not connected'} mono />
      <DataRow
        label="Native tPOT balance"
        value={
          balance.loading
            ? 'Loading…'
            : balance.error
              ? 'Unavailable'
              : balance.free
                ? `${formatBaseUnits(balance.free, decimals)} tPOT`
                : 'Unavailable'
        }
        mono
      />
      <DataRow
        label="Estimated transfer amount"
        value={amount ? `${formatBaseUnits(amount, decimals)} tPOT` : 'Unavailable'}
        mono
      />
      <DataRow
        label="Estimated fee"
        value={fee ? `${formatBaseUnits(fee, decimals)} tPOT` : 'Unavailable'}
        mono
      />
      <DataRow
        label="Estimated remaining"
        value={remaining ? `${formatBaseUnits(remaining, decimals)} tPOT` : 'Unavailable'}
        mono
      />
      <div className="row">
        <span className="row__label">Sufficient funds</span>
          <span className={`state state--${balance.free ? (sufficient ? 'connected' : 'error') : 'disconnected'}`}>
            <span className="state__dot" aria-hidden="true" />
            {!balance.free
              ? 'Unavailable'
              : !canVerify
                ? 'Unable to verify'
                : sufficient
                  ? 'Yes (estimate)'
                  : 'No'}
          </span>
      </div>
      {balance.error ? <div className="alert alert--error"><strong>Balance read failed.</strong> {balance.error}</div> : null}
      <div className="row">
        <span className="row__label">Last balance read</span>
        <span>{balance.updatedAt ? new Date(balance.updatedAt).toLocaleTimeString() : 'Never'}</span>
      </div>
      <button type="button" className="btn btn--ghost" onClick={() => void readBalance()} disabled={balance.loading}>
        {balance.loading ? 'Refreshing…' : 'Refresh balance'}
      </button>
    </Panel>
  );
}
