import { useMemo } from 'react';
import { validateInputs } from '../lib/readiness';

export interface ReadinessFormValues {
  sender: string;
  recipient: string;
  amount: string;
}

export function ReadinessForm({
  values,
  onChange,
  onSubmit,
  running,
  disabled,
  ss58Prefix,
}: {
  values: ReadinessFormValues;
  onChange: (next: ReadinessFormValues) => void;
  onSubmit: () => void;
  running: boolean;
  disabled: boolean;
  ss58Prefix: number | null;
}) {
  const local = useMemo(
    () =>
      validateInputs({
        sender: values.sender,
        recipient: values.recipient,
        amount: values.amount,
        ss58Prefix,
      }),
    [values, ss58Prefix],
  );

  const canSubmit = local.valid && !running && !disabled;

  const set = (key: keyof ReadinessFormValues) => (value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          onSubmit();
        }
      }}
    >
      <label className="field">
        <span className="field__label">Sender address</span>
        <input
          className="field__input field__input--mono"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="SS58 address of the sending account"
          value={values.sender}
          onChange={(event) => set('sender')(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">Recipient address</span>
        <input
          className="field__input field__input--mono"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="SS58 address of the receiving account"
          value={values.recipient}
          onChange={(event) => set('recipient')(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">Amount</span>
        <div className="field__group">
          <input
            className="field__input field__input--mono"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="0.0"
            value={values.amount}
            onChange={(event) => set('amount')(event.target.value)}
          />
          <span className="field__suffix">tPOT</span>
        </div>
      </label>

      {local.errors.length > 0 ? (
        <ul className="form__errors">
          {local.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      {local.notes.map((note) => (
        <p key={note} className="muted muted--warning">
          {note}
        </p>
      ))}

      <button
        type="submit"
        className="btn btn--primary"
        disabled={!canSubmit}
      >
        {running ? 'Running live checks…' : 'Run live readiness check'}
      </button>

      <p className="muted">
        Runs read-only RPC calls only: account balances, fee estimation and a
        dry-run simulation. No transaction is signed or submitted.
      </p>
    </form>
  );
}
