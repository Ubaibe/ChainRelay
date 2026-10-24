import { Panel, DataRow } from './Primitives';
import {
  EXPECTED_NETWORK,
  diffNetwork,
  type NetworkMismatch,
  type NetworkSnapshot,
} from '../lib/chain';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

const STATE_TEXT: Record<ConnectionState, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection error',
};

export function NetworkPanel({
  endpoint,
  state,
  error,
  network,
  onReconnect,
  busy,
}: {
  endpoint: string;
  state: ConnectionState;
  error: string | null;
  network: NetworkSnapshot | null;
  onReconnect: () => void;
  busy: boolean;
}) {
  const mismatches: NetworkMismatch[] = network ? diffNetwork(network) : [];

  return (
    <Panel
      title="Network status"
      subtitle="Live values queried from the connected node."
      actions={
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onReconnect}
          disabled={busy}
        >
          {busy ? 'Connecting…' : 'Reconnect'}
        </button>
      }
    >
      <div className="row">
        <span className="row__label">Connection</span>
        <span className={`state state--${state}`}>
          <span className="state__dot" aria-hidden="true" />
          {STATE_TEXT[state]}
        </span>
      </div>

      <DataRow label="Endpoint" value={endpoint} mono />

      {error ? (
        <div className="alert alert--error">
          <strong>Connection failed.</strong> {error}
        </div>
      ) : null}

      {state !== 'connected' ? (
        <p className="muted">
          Network details appear once the WebSocket connection is established. No
          values are shown before a real connection succeeds.
        </p>
      ) : null}

      {state === 'connected' && network ? (
        <>
          <DataRow label="Chain" value={network.chain ?? 'unavailable'} />
          <DataRow
            label="Node"
            value={
              network.nodeName
                ? `${network.nodeName}${network.nodeVersion ? ` v${network.nodeVersion}` : ''}`
                : 'unavailable'
            }
          />
          <DataRow
            label="Block height"
            value={network.blockHeight ?? 'unavailable'}
            mono
          />
          <DataRow
            label="Runtime spec"
            value={`${network.specName ?? 'unavailable'}${network.specVersion ? ` / ${network.specVersion}` : ''}`}
            mono
          />
          <DataRow
            label="Token"
            value={`${network.tokenSymbol ?? 'unavailable'} (${network.tokenDecimals ?? '?'} decimals)`}
          />
          <DataRow
            label="SS58 prefix"
            value={network.ss58Prefix ?? 'unavailable'}
            mono
          />
          <DataRow
            label="Genesis hash"
            value={network.genesisHash ?? 'unavailable'}
            mono
          />

          {mismatches.length === 0 ? (
            <p className="muted muted--ok">
              Observed values match the expected Portaldot V3 testnet identifiers.
            </p>
          ) : (
            <div className="alert alert--warning">
              <strong>Observed values differ from the expected V3 testnet.</strong>
              <ul>
                {mismatches.map((m) => (
                  <li key={m.field}>
                    {m.field}: expected <code>{m.expected}</code>, observed{' '}
                    <code>{m.observed}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="muted">
            Expected reference values: chain <code>{EXPECTED_NETWORK.chain}</code>, spec{' '}
            <code>
              {EXPECTED_NETWORK.specName}/{EXPECTED_NETWORK.specVersion}
            </code>
            , token <code>{EXPECTED_NETWORK.tokenSymbol}</code> with{' '}
            {EXPECTED_NETWORK.tokenDecimals} decimals, SS58 prefix{' '}
            {EXPECTED_NETWORK.ss58Prefix}, EVM chain id{' '}
            {EXPECTED_NETWORK.evmChainId}. These are expectations for comparison
            only — every displayed value above comes from a live query.
          </p>
        </>
      ) : null}
    </Panel>
  );
}
