import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NetworkPanel } from './components/NetworkPanel';
import { ReadinessForm, type ReadinessFormValues } from './components/ReadinessForm';
import { ResultsPanel } from './components/ResultsPanel';
import { ReadinessChecklist } from './components/ReadinessChecklist';
import { useNodeConnection } from './hooks/useNodeConnection';
import { useWallet } from './hooks/useWallet';
import { WalletPanel } from './components/WalletPanel';
import { WalletBalanceOverview } from './components/WalletBalanceOverview';
import { TransactionReadinessPassportPanel } from './components/TransactionReadinessPassport';
import { buildTransactionReadinessPassport } from './lib/passport';
import { DEFAULT_WS_URL, EXPECTED_NETWORK } from './lib/chain';
import { runReadinessCheck, type ReadinessResult } from './lib/readiness';
import { readEvmIdentity, type EvmIdentitySnapshot } from './lib/evmChain';

const ENDPOINT = import.meta.env.VITE_PORTALDOT_WS_URL || DEFAULT_WS_URL;

const EMPTY_FORM: ReadinessFormValues = { sender: '', recipient: '', amount: '' };

export default function App() {
  const connection = useNodeConnection(ENDPOINT);
  const wallet = useWallet();
  const [form, setForm] = useState<ReadinessFormValues>(EMPTY_FORM);
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [evmSnapshot, setEvmSnapshot] = useState<EvmIdentitySnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastNetworkUpdate, setLastNetworkUpdate] = useState<number | null>(null);
  // Monotonic token: a slow run that finishes after a newer one started must
  // not overwrite the newer result.
  const runTokenRef = useRef(0);

  const decimals = connection.network?.tokenDecimals ?? EXPECTED_NETWORK.tokenDecimals;
  const ss58Prefix = connection.network?.ss58Prefix ?? null;

  const passport = useMemo(
    () =>
      buildTransactionReadinessPassport({
        network: connection.network,
        expectedGenesisHash: EXPECTED_NETWORK.genesisHash,
        walletAddress: wallet.selectedAddress,
        walletConnected: wallet.status === 'connected',
        signerInterfaceDetected: wallet.signerAvailable,
        decimals,
        result,
        revealAddresses: false,
        evmSnapshot,
      }),
    [connection.network, wallet.selectedAddress, wallet.status, wallet.signerAvailable, decimals, result, evmSnapshot],
  );

  useEffect(() => {
    if (connection.network) {
      setLastNetworkUpdate(Date.now());
    } else {
      setLastNetworkUpdate(null);
    }
  }, [connection.network]);

  useEffect(() => {
    setResult(null);
    setEvmSnapshot(null);
    setRunError(null);
  }, [form, wallet.selectedAddress, connection.state, connection.network]);

  const runCheck = useCallback(async () => {
    const api = connection.getApi();

    if (!api) {
      setRunError(
        'No live node connection is available. Connect to the endpoint before running checks.',
      );
      return;
    }

    const token = ++runTokenRef.current;

    setRunning(true);
    setRunError(null);

    try {
      const outcome = await runReadinessCheck(api, {
        sender: form.sender.trim(),
        recipient: form.recipient.trim(),
        amount: form.amount.trim(),
        ss58Prefix,
      });
      const evmOutcome = await readEvmIdentity();
      if (token !== runTokenRef.current) {
        return;
      }
      setResult(outcome);
      setEvmSnapshot(evmOutcome);
    } catch (err) {
      if (token !== runTokenRef.current) {
        return;
      }
      setResult(null);
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      if (token === runTokenRef.current) {
        setRunning(false);
      }
    }
  }, [connection, form, ss58Prefix]);

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__inner">
          <div className="masthead__identity">
            <span className="masthead__mark" aria-hidden="true" />
            <div>
              <h1 className="masthead__title">ChainRelay Recon</h1>
              <p className="masthead__tagline">
                Read-only transaction-safety diagnostics for the Portaldot V3
                testnet
              </p>
            </div>
          </div>
          <span className={`pill pill--${connection.state}`}>
            {connection.state === 'connected'
              ? 'Node connected'
              : connection.state === 'connecting'
                ? 'Connecting…'
                : connection.state === 'error'
                  ? 'Connection error'
                  : connection.state === 'disconnected'
                    ? 'Disconnected'
                    : 'Idle'}
          </span>
        </div>
      </header>

      <main className="layout">
        <div className="layout__aside">
          <section className="intro">
            <h2 className="intro__title">What ChainRelay does</h2>
            <p>
              ChainRelay inspects a Substrate/Portaldot chain before you
              transact. It validates an intent, reads account balances,
              estimates the fee for an unsigned call, runs conservative preflight
              checks and reports every assumption it could not verify.
            </p>
            <h3 className="intro__subtitle">What it does not do yet</h3>
            <p>
              ChainRelay never signs, broadcasts or submits a transaction, and
              it does not verify on-chain execution. A fee estimate is an
              estimate, and a passing preflight check is not a guarantee that a
              transfer will succeed.
            </p>
          </section>

          <NetworkPanel
            endpoint={ENDPOINT}
            state={connection.state}
            error={connection.error}
            network={connection.network}
            onReconnect={() => void connection.connect()}
            busy={connection.busy}
            lastUpdated={lastNetworkUpdate}
          />

          <WalletPanel wallet={wallet} />

          <WalletBalanceOverview
            walletAddress={wallet.selectedAddress}
            result={result}
            decimals={decimals}
            getApi={connection.getApi}
            networkState={connection.state}
          />

          <TransactionReadinessPassportPanel passport={passport} />

          <ReadinessChecklist
            walletConnected={wallet.status === 'connected'}
            networkOk={connection.state === 'connected' && !connection.error}
            result={result}
          />


          <section className="panel">
            <header className="panel__header">
              <div>
                <h2 className="panel__title">Transaction readiness workbench</h2>
                <p className="panel__subtitle">
                  Builds a <code>balances.transferKeepAlive</code> call. Nothing
                  is submitted.
                </p>
              </div>
            </header>
            <div className="panel__body">
              <ReadinessForm
                values={form}
                onChange={setForm}
                onSubmit={() => void runCheck()}
                running={running}
                disabled={connection.state !== 'connected'}
                ss58Prefix={ss58Prefix}
              />
              {connection.state !== 'connected' ? (
                <p className="muted muted--warning">
                  The live check needs an open node connection. Use “Reconnect”
                  in the network panel if the node is unreachable.
                </p>
              ) : null}
              {runError ? (
                <div className="alert alert--error">
                  <strong>The check could not run.</strong> {runError}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="layout__main">
          <ResultsPanel result={result} decimals={decimals} running={running} />
        </div>
      </main>

      <footer className="footer">
        <p className="footer__notice">
          Read-only diagnostic: ChainRelay has not signed or submitted this
          transaction.
        </p>
        <p className="footer__meta">
          ChainRelay Recon — read-only diagnostics. No wallet connection, no
          private keys, no transaction submission.
        </p>
      </footer>
    </div>
  );
}
