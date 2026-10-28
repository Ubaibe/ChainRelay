import { DataRow, Panel, StatusBadge } from './Primitives';
import {
  abbreviateAddress,
  formatBaseUnits,
  formatTimestamp,
  formatWeight,
} from '../lib/format';
import type { ReadinessResult } from '../lib/readiness';

function BalanceTable({
  title,
  account,
  decimals,
}: {
  title: string;
  account: {
    address: string;
    free: string | null;
    reserved: string | null;
    miscFrozen: string | null;
    feeFrozen: string | null;
    frozen: string | null;
    frozenBreakdownKnown: boolean;
  } | null;
  decimals: number;
}) {
  if (!account) {
    return null;
  }

  return (
    <div className="balance">
      <div className="balance__head">
        <span className="balance__title">{title}</span>
        <code className="balance__address" title={account.address}>
          {abbreviateAddress(account.address)}
        </code>
      </div>
      <DataRow label="Free" value={formatBaseUnits(account.free, decimals)} mono />
      <DataRow
        label="Reserved"
        value={formatBaseUnits(account.reserved, decimals)}
        mono
      />
      <DataRow
        label="Frozen"
        value={
          account.frozenBreakdownKnown
            ? `${formatBaseUnits(account.miscFrozen, decimals)} misc / ${formatBaseUnits(
                account.feeFrozen,
                decimals,
              )} fee`
            : `${formatBaseUnits(account.frozen, decimals)} (breakdown unknown)`
        }
        mono
      />
    </div>
  );
}

export function ResultsPanel({
  result,
  decimals,
  running,
}: {
  result: ReadinessResult | null;
  decimals: number;
  running: boolean;
}) {
  if (running) {
    return (
      <Panel title="Results" subtitle="Live read-only checks.">
        <p className="muted">Running live checks against the node…</p>
      </Panel>
    );
  }

  if (!result) {
    return (
      <Panel title="Results" subtitle="Live read-only checks.">
        <p className="muted">
          No check has been run yet. Enter a sender, a recipient and an amount
          above, then run the live readiness check.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Results" subtitle="Live read-only checks.">
      <p className="muted result__timestamp">
        Checked at {formatTimestamp(result.finishedAt)} (local time). Every value
        below was read from the node during this run.
      </p>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge status={result.validation.status} />
          Input validation
        </h3>
        <p className="result__headline">{result.validation.headline}</p>
        {result.validation.errors.length > 0 ? (
          <ul className="result__list">
            {result.validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge status={result.account.status} />
          Account balance
        </h3>
        <p className="result__headline">{result.account.headline}</p>
        <div className="balance-grid">
          <BalanceTable
            title="Sender"
            account={result.account.signer}
            decimals={decimals}
          />
          <BalanceTable
            title="Recipient"
            account={result.account.recipient}
            decimals={decimals}
          />
        </div>
        {result.account.details.map((detail) => (
          <p key={detail} className="muted">
            {detail}
          </p>
        ))}
      </section>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge status={result.construct.status} />
          Transfer-call construction
        </h3>
        <p className="result__headline">{result.construct.headline}</p>
        {result.construct.details.map((detail) => (
          <p key={detail} className="muted">
            {detail}
          </p>
        ))}
      </section>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge status={result.fee.status} />
          Estimated fee
        </h3>
        <p className="result__headline">{result.fee.headline}</p>
        {result.fee.estimate ? (
          <>
            <DataRow
              label="Estimated partial fee"
              value={`${result.fee.estimate.partialFee} base units`}
              mono
            />
            <DataRow
              label="Estimated partial fee (decimal)"
              value={`${formatBaseUnits(result.fee.estimate.partialFee, decimals)} tPOT`}
              mono
            />
            <DataRow
              label="Estimated remaining after amount + fee"
              value={
                result.account.signer?.free
                  ? (() => {
                      try {
                        const free = BigInt(result.account.signer.free);
                        const amount = BigInt(result.preview?.amountBaseUnits ?? '0');
                        const fee = BigInt(result.fee.estimate.partialFee);
                        const remaining = free - amount - fee;
                        return `${formatBaseUnits(remaining.toString(), decimals)} tPOT`;
                      } catch {
                        return 'Unavailable';
                      }
                    })()
                  : 'Unavailable'
              }
              mono
            />
            <DataRow
              label="Weight"
              value={formatWeight(result.fee.estimate.weight)}
              mono
            />
            <DataRow label="Dispatch class" value={result.fee.estimate.class ?? 'unavailable'} />
            <DataRow
              label="Pays fee"
              value={result.fee.estimate.paysFee ?? 'not reported by the runtime'}
            />
            <DataRow label="Method" value={result.fee.estimate.method} mono />
          </>
        ) : null}
        {result.fee.details.map((detail) => (
          <p key={detail} className="muted">
            {detail}
          </p>
        ))}
      </section>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge status={result.readiness.status} />
          Readiness assessment
        </h3>
        <p className="result__headline">{result.readiness.headline}</p>
        {result.readiness.details.map((detail) => (
          <p key={detail} className="muted">
            {detail}
          </p>
        ))}
      </section>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge status={result.simulation.status} />
          Simulation (dry-run)
        </h3>
        <p className="result__headline">{result.simulation.headline}</p>
        {result.simulation.details.map((detail) => (
          <p key={detail} className="muted">
            {detail}
          </p>
        ))}
      </section>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge
            status={result.warnings.length > 0 ? 'WARNING' : 'PASS'}
          />
          Warnings and limitations
        </h3>
        {result.warnings.length === 0 ? (
          <p className="muted">No warnings were raised by this check.</p>
        ) : (
          <ul className="result__list">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="result">
        <h3 className="result__title">
          <StatusBadge status={result.preview ? 'PASS' : 'NOT_CHECKED'} />
          Transaction preview
        </h3>
        {result.preview ? (
          <>
            <DataRow
              label="Call"
              value={`${result.preview.pallet}.${result.preview.method}`}
              mono
            />
            <DataRow label="Recipient" value={result.preview.recipient} mono />
            <DataRow
              label="Amount"
              value={`${result.preview.amountBaseUnits} base units`}
              mono
            />
            <DataRow
              label="Amount (decimal)"
              value={`${formatBaseUnits(result.preview.amountBaseUnits, decimals)} tPOT`}
              mono
            />
            <DataRow label="Encoded call" value={result.preview.callHex} mono />
            <p className="muted">
              This is the encoded call that was fee-estimated and dry-run. It was
              never signed and never submitted.
            </p>
          </>
        ) : (
          <p className="muted">No call was constructed.</p>
        )}
      </section>
    </Panel>
  );
}
