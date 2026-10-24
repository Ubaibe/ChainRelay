import type { ReactNode } from 'react';
import type { CheckStatus } from '../lib/readiness';

const STATUS_LABEL: Record<CheckStatus, string> = {
  PASS: 'PASS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  NOT_CHECKED: 'NOT CHECKED',
};

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`badge badge--${status.toLowerCase().replace('_', '-')}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <h2 className="panel__title">{title}</h2>
          {subtitle ? <p className="panel__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function DataRow({
  label,
  value,
  mono = false,
  hint,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="row">
      <span className="row__label">
        {label}
        {hint ? <span className="row__hint"> {hint}</span> : null}
      </span>
      <span className={mono ? 'row__value row__value--mono' : 'row__value'}>
        {value}
      </span>
    </div>
  );
}
