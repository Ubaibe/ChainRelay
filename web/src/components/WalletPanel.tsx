import { abbreviateAddress } from '../lib/format';
import { Panel } from './Primitives';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import type { WalletConnection, WalletStatus } from '../hooks/useWallet';

const STATUS_TEXT: Record<WalletStatus, string> = {
  disconnected: 'Not connected',
  connecting: 'Authorizing…',
  connected: 'Connected',
  error: 'Connection error',
};

function AccountOption({
  account,
  isSelected,
  onSelect,
}: {
  account: InjectedAccountWithMeta;
  isSelected: boolean;
  onSelect: (address: string) => void;
}) {
  return (
    <button
      type="button"
      className={`account-btn ${isSelected ? 'account-btn--selected' : ''}`}
      onClick={() => onSelect(account.address)}
      aria-pressed={isSelected}
    >
      <span className="account-btn__address" title={account.address}>
        {abbreviateAddress(account.address)}
      </span>
      {account.meta.source ? (
        <span className="account-btn__source">{account.meta.source}</span>
      ) : null}
    </button>
  );
}

export function WalletPanel({
  wallet,
}: {
  wallet: WalletConnection;
}) {
  const canConnect = wallet.status !== 'connecting';
  const hasAccounts = wallet.accounts.length > 0;
  const showAccountSelector =
    wallet.status === 'connected' && hasAccounts && wallet.accounts.length > 1;
  const status = wallet.status;

  return (
    <Panel
      title="Wallet connection"
      subtitle="Connection prototype only. No transaction signing or submission."
      actions={
        wallet.status === 'connected' ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={wallet.disconnect}
            disabled={status === 'connecting'}
          >
            {status === 'connecting' ? 'Authorizing…' : 'Disconnect'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={wallet.connect}
            disabled={!canConnect}
          >
            {wallet.status === 'connecting' ? 'Authorizing…' : 'Connect wallet'}
          </button>
        )
      }
    >
      <div className="row">
        <span className="row__label">Status</span>
        <span className={`state state--${wallet.status === 'connected' ? 'connected' : wallet.status === 'error' ? 'error' : 'disconnected'}`}>
          <span className="state__dot" aria-hidden="true" />
          {STATUS_TEXT[wallet.status]}
        </span>
      </div>

      {!wallet.extensionDetected && wallet.status === 'disconnected' ? (
        <div className="alert alert--warning">
          <strong>No wallet detected.</strong> Install a Polkadot.js-compatible
          browser extension (Polkadot.js, Talisman or SubWallet), unlock it,
          then click “Connect wallet”.
        </div>
      ) : null}

      {wallet.error ? (
        <div className="alert alert--error">
          <strong>Connection failed.</strong> {wallet.error}
        </div>
      ) : null}

      {wallet.status === 'connected' && !wallet.error ? (
        <>
          <div className="row">
            <span className="row__label">Account</span>
            <div className="account-display">
              {showAccountSelector ? (
                <div className="account-list">
                  {wallet.accounts.map((account) => (
                    <AccountOption
                      key={account.address}
                      account={account}
                      isSelected={account.address === wallet.selectedAddress}
                      onSelect={wallet.selectAccount}
                    />
                  ))}
                </div>
              ) : (
                <code
                  className="account-address"
                  title={wallet.selectedAddress ?? undefined}
                >
                  {wallet.selectedAddress
                    ? abbreviateAddress(wallet.selectedAddress)
                    : '—'}
                </code>
              )}
            </div>
          </div>
          <div className="row">
            <span className="row__label">Signer interface</span>
            <span className={`state state--${wallet.signerAvailable ? 'connected' : 'disconnected'}`}>
              <span className="state__dot" aria-hidden="true" />
              {wallet.signerAvailable ? 'Signer available' : 'Signer not available'}
            </span>
            <p className="muted">
              Signer presence is a limited interface check only. No signing
              method is invoked and no transaction is submitted.
            </p>
          </div>
          <p className="muted">
            Connection state is held in memory only. It is cleared on refresh
            or disconnect and is never written to local storage.
          </p>
        </>
      ) : null}

      {wallet.status === 'disconnected' && !wallet.extensionDetected && !wallet.error ? (
        <p className="muted">
          Click “Connect wallet” to authorize ChainRelay through your installed
          browser extension. Your private key never leaves the extension.
        </p>
      ) : null}
    </Panel>
  );
}
