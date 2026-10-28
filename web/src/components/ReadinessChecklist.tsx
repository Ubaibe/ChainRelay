import { StatusBadge } from './Primitives';
import type { ReadinessResult } from '../lib/readiness';

export function ReadinessChecklist({
  walletConnected,
  networkOk,
  result,
}: {
  walletConnected: boolean;
  networkOk: boolean;
  result: ReadinessResult | null;
}) {
  const items = [
    {
      label: 'Wallet connected',
      status: walletConnected ? 'PASS' : 'NOT CHECKED',
    },
    {
      label: 'Expected Portaldot V3 network',
      status: networkOk ? 'PASS' : result ? 'FAIL' : 'NOT CHECKED',
    },
    {
      label: 'Recipient address valid',
      status: result ? (result.validation.errors.some((e) => /recipient/i.test(e)) ? 'FAIL' : 'PASS') : 'NOT CHECKED',
    },
    {
      label: 'Amount valid and greater than zero',
      status: result ? (result.validation.errors.some((e) => /amount/i.test(e)) ? 'FAIL' : 'PASS') : 'NOT CHECKED',
    },
    {
      label: 'Wallet balance sufficient',
      status: result ? result.readiness.status : 'NOT CHECKED',
    },
    {
      label: 'Fee estimate available',
      status: result ? result.fee.status : 'NOT CHECKED',
    },
    {
      label: 'Simulation result available',
      status: result ? result.simulation.status : 'NOT CHECKED',
    },
  ];

  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__title">Readiness checklist</h2>
          <p className="panel__subtitle">
            Derived from actual preflight state. Read-only; no transaction is
            signed or submitted.
          </p>
        </div>
      </header>
      <div className="panel__body">
        <ul className="result__list">
          {items.map((item) => (
            <li key={item.label}>
              <StatusBadge status={item.status as any} /> {item.label}
            </li>
          ))}
        </ul>
        <p className="muted">
          Readiness reduces avoidable mistakes but does not guarantee
          transaction success.
        </p>
      </div>
    </section>
  );
}
