import { useMemo, useState } from 'react';

import { buildEvidenceIndex, type EvidenceItem } from '../lib/evidenceIndex';

const CATEGORIES = [
  'Network',
  'Account',
  'Transaction',
  'Fee',
  'Balance',
  'Simulation',
  'EVM',
  'Dual-interface',
  'Diagnostics',
  'Timestamps',
] as const;

export function TransactionEvidenceInspector({ passport }: { passport: any }) {
  const items = useMemo(() => buildEvidenceIndex(passport), [passport]);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const category of CATEGORIES) initial[category] = true;
    return initial;
  });

  const grouped = useMemo(() => {
    const result: Record<string, EvidenceItem[]> = {};
    for (const category of CATEGORIES) result[category] = [];
    for (const item of items) {
      if (!result[item.category]) result[item.category] = [];
      result[item.category].push(item);
    }
    return result;
  }, [items]);

  return (
    <section className="panel" aria-label="Transaction evidence inspector">
      <header className="panel__header">
        <h3 className="panel__title">Evidence inspector</h3>
        <p className="panel__subtitle">Read-only evidence supporting Passport checks and findings.</p>
      </header>
      <div className="panel__body">
        {CATEGORIES.map((category) => {
          const categoryItems = grouped[category] ?? [];
          const isOpen = open[category] ?? false;
          return (
            <div key={category} className="evidence-category">
              <button type="button" className="btn btn--ghost" onClick={() => setOpen((current) => ({ ...current, [category]: !isOpen }))} aria-expanded={isOpen}>
                {category} ({categoryItems.length})
              </button>
              {isOpen ? (
                <ul className="result__list">
                  {categoryItems.length === 0 ? <li>No evidence available.</li> : categoryItems.map((item) => (
                    <li key={item.id}>
                      <strong>{item.label}:</strong> {item.status}
                      {item.value !== null && item.value !== undefined ? <span className="muted"> {item.value}</span> : null}
                      <p className="muted">{item.explanation}</p>
                      {item.provenance ? <p className="muted">Source: {item.provenance}</p> : null}
                      {item.observedAt !== null && item.observedAt !== undefined ? <p className="muted">Observed at: {item.observedAt}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
