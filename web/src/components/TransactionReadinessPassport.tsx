import { useState } from 'react';

import { Panel } from './Primitives';
import { TransactionEvidenceInspector } from './TransactionEvidenceInspector';
import {
  passportToJson,
  passportToMarkdown,
  type TransactionReadinessPassport,
} from '../lib/passport';

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TransactionReadinessPassportPanel({
  passport,
}: {
  passport: TransactionReadinessPassport;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Panel
      title="Transaction Readiness Passport"
      subtitle="Structured, read-only readiness evidence. No transaction was signed or submitted."
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => download('chainrelay-passport.json', passportToJson(passport), 'application/json')}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => download('chainrelay-passport.md', passportToMarkdown(passport), 'text/markdown')}
          >
            Export Markdown
          </button>
        </>
      }
    >
      <div className="row">
        <span className="row__label">Report ID</span>
        <span className="row__value row__value--mono">{passport.reportId}</span>
      </div>
      <div className="row">
        <span className="row__label">Generated (UTC)</span>
        <span className="row__value">{passport.generatedAtUtc}</span>
      </div>
      <div className="row">
        <span className="row__label">Overall assessment</span>
        <span className="row__value">{passport.overallAssessment}</span>
      </div>

      <h3 className="result__title">Evidence checklist</h3>
      <ul className="result__list">
        {passport.checks.map((check) => (
          <li key={check.name}>
            <strong>{check.name}:</strong> {check.status} - {check.explanation}
            {check.evidence ? <span className="muted"> ({check.evidence})</span> : null}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Hide technical evidence' : 'Show technical evidence'}
      </button>
      {expanded ? (
        <pre className="row__value row__value--mono">{passportToJson(passport)}</pre>
      ) : null}

      <h3 className="result__title">Explainable findings</h3>
      {passport.diagnostics.length === 0 ? (
        <p className="muted">No diagnostic findings were generated from this passport.</p>
      ) : (
        <ul className="result__list">
          {passport.diagnostics.map((finding) => (
            <li key={finding.code}>
              <strong>{finding.title}</strong> ({finding.code}) - {finding.status}
              <p className="muted">{finding.explanation}</p>
              <p className="muted">Why it matters: {finding.whyItMatters}</p>
              <p className="muted">Evidence: {finding.evidence ?? 'unavailable'}</p>
              <p className="muted">Suggested action: {finding.suggestedAction ?? 'none'}</p>
              <p className="muted">Related check: {finding.relatedCheck}</p>
            </li>
          ))}
        </ul>
      )}
      <TransactionEvidenceInspector passport={passport} />
      <ul className="result__list">
        {passport.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </Panel>
  );
}
