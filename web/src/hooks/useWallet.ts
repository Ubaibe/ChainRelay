import { useCallback, useRef, useState } from 'react';
import type { InjectedAccountWithMeta, InjectedExtension } from '@polkadot/extension-inject/types';
import { web3Accounts, web3Enable, web3FromAddress, isWeb3Injected } from '@polkadot/extension-dapp';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WalletConnection {
  status: WalletStatus;
  error: string | null;
  accounts: InjectedAccountWithMeta[];
  selectedAddress: string | null;
  extensions: InjectedExtension[];
  signerAvailable: boolean;
  extensionDetected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  selectAccount: (address: string) => void;
}

const DAPP_NAME = 'ChainRelay';

/**
 * Experimental wallet connection lifecycle for the Portaldot Extension.
 *
 * This is connection-only: it never calls signPayload, signRaw, signAndSend
 * or any other signing method. The signer is inspected only to confirm the
 * interface exists — it is not used to sign anything.
 *
 * All state lives in React memory. Nothing is written to localStorage,
 * sessionStorage, or cookies.
 */
export function useWallet(): WalletConnection {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<InjectedAccountWithMeta[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<InjectedExtension[]>([]);
  const [signerAvailable, setSignerAvailable] = useState(false);

  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const accountsRef = useRef<InjectedAccountWithMeta[]>([]);

  const extensionDetected = isWeb3Injected;

  const connect = useCallback(async () => {
    const attempt = ++attemptRef.current;
    const isCurrent = () => mountedRef.current && attemptRef.current === attempt;

    setStatus('connecting');
    setError(null);

    if (!extensionDetected) {
      if (!isCurrent()) {
        return;
      }
      setStatus('error');
      setError(
        'No injected Web3 wallet was detected in this browser. Install a Polkadot.js-compatible extension (e.g. Polkadot.js, Talisman or SubWallet) and refresh the page.',
      );
      return;
    }

    try {
      // web3Enable triggers the wallet's authorization popup. It is only
      // called here, after an explicit user click — never on page load.
      const enabled = await web3Enable(DAPP_NAME);

      if (!isCurrent()) {
        return;
      }

      if (enabled.length === 0) {
        setStatus('error');
        setError(
          'No wallet extension authorized ChainRelay. If you have an extension installed, unlock it and try again.',
        );
        return;
      }

      setExtensions(enabled);

      let fetched: InjectedAccountWithMeta[];
      try {
        fetched = await web3Accounts();
      } catch (err) {
        if (!isCurrent()) {
          return;
        }
        setStatus('error');
        setError(
          err instanceof Error ? err.message : 'Failed to read wallet accounts.',
        );
        return;
      }

      if (!isCurrent()) {
        return;
      }

      setAccounts(fetched);
      accountsRef.current = fetched;

      if (fetched.length === 0) {
        setStatus('error');
        setError(
          'The wallet is unlocked but no accounts are available. Add or unlock an account in your extension, then reconnect.',
        );
        return;
      }

      // Validate that the first account exposes a signer interface. This is
      // a limited interface check only — no signing method is invoked.
      let signerOk = false;
      try {
        const ext = await web3FromAddress(fetched[0].address);
        if (!isCurrent()) {
          return;
        }
        signerOk = typeof ext.signer?.signPayload === 'function';
      } catch {
        // Signer inspection failed — treat as unavailable but still allow
        // the connection to proceed read-only.
        signerOk = false;
      }

      setSignerAvailable(signerOk);
      setSelectedAddress(fetched[0].address);
      setStatus('connected');
    } catch (err) {
      if (!isCurrent()) {
        return;
      }
      setStatus('error');
      setError(
        err instanceof Error
          ? `Wallet connection failed: ${err.message}`
          : 'Wallet connection failed for an unknown reason.',
      );
    }
  }, [extensionDetected]);

  const disconnect = useCallback(() => {
    attemptRef.current += 1;
    setStatus('disconnected');
    setError(null);
    setAccounts([]);
    setSelectedAddress(null);
    setExtensions([]);
    setSignerAvailable(false);
  }, []);

  const selectAccount = useCallback((address: string) => {
    const match = accountsRef.current.find((a) => a.address === address);
    if (!match) {
      return;
    }
    setSelectedAddress(address);
  }, []);

  return {
    status,
    error,
    accounts,
    selectedAddress,
    extensions,
    signerAvailable,
    extensionDetected,
    connect,
    disconnect,
    selectAccount,
  };
}
