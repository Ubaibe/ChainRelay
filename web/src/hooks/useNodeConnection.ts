import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiPromise } from '@polkadot/api';

import {
  EMPTY_NETWORK,
  connectToNode,
  disconnectFromNode,
  readNetworkSnapshot,
  type NetworkSnapshot,
} from '../lib/chain';
import type { ConnectionState } from '../components/NetworkPanel';

export interface NodeConnection {
  state: ConnectionState;
  error: string | null;
  network: NetworkSnapshot | null;
  busy: boolean;
  getApi: () => ApiPromise | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Manages the read-only node connection for the dashboard.
 *
 * Two invariants matter here:
 *
 * 1. Only the newest connection attempt may publish state. A slow attempt that
 *    resolves after a newer one must not overwrite the newer result.
 * 2. Every socket that is opened is closed again — on reconnect, on unmount and
 *    when the page goes away.
 */
export function useNodeConnection(endpoint: string): NodeConnection {
  const [state, setState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const apiRef = useRef<ApiPromise | null>(null);
  const mountedRef = useRef(true);
  // Monotonic token: only the newest connect attempt may publish state.
  const attemptRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const connect = useCallback(async () => {
    const attempt = ++attemptRef.current;
    const isCurrent = () => mountedRef.current && attemptRef.current === attempt;

    setBusy(true);
    setState('connecting');
    setError(null);

    // Close any previous connection first so no socket is leaked.
    const previous = apiRef.current;
    apiRef.current = null;
    if (previous) {
      await disconnectFromNode(previous);
    }

    if (!isCurrent()) {
      return;
    }

    try {
      const api = await connectToNode(endpoint);

      if (!isCurrent()) {
        // A newer attempt already won: close this socket immediately.
        await disconnectFromNode(api);
        return;
      }

      apiRef.current = api;

      // A dropped connection must be surfaced instead of silently pretending
      // to still be connected.
      api.on('disconnected', () => {
        if (!isCurrent()) {
          return;
        }
        setNetwork(null);
        setState('disconnected');
        setError(
          'The node closed the WebSocket connection. Reconnect to open a new one.',
        );
      });

      api.on('error', (providerError: Error) => {
        if (!isCurrent()) {
          return;
        }
        setNetwork(null);
        setState('error');
        setError(
          providerError?.message
            ? `Node RPC error: ${providerError.message}`
            : 'Node RPC error.',
        );
      });

      // The provider reconnects on its own; refresh the live values when it
      // comes back so the panel never shows stale numbers.
      api.on('connected', () => {
        if (!isCurrent()) {
          return;
        }
        void (async () => {
          try {
            const snapshot = await readNetworkSnapshot(api);
            if (!isCurrent()) {
              return;
            }
            setNetwork(snapshot);
            setState('connected');
            setError(null);
          } catch (err) {
            if (!isCurrent()) {
              return;
            }
            setNetwork(null);
            setState('error');
            setError(err instanceof Error ? err.message : String(err));
          }
        })();
      });

      const snapshot = await readNetworkSnapshot(api);

      if (!isCurrent()) {
        await disconnectFromNode(api);
        return;
      }

      setNetwork(snapshot);
      setState('connected');
    } catch (err) {
      if (!isCurrent()) {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setNetwork(null);
      setState('error');
    } finally {
      if (isCurrent()) {
        setBusy(false);
      }
    }
  }, [endpoint]);

  const disconnect = useCallback(async () => {
    // Invalidate any in-flight attempt so it cannot restore the connection.
    attemptRef.current += 1;
    const api = apiRef.current;
    apiRef.current = null;
    await disconnectFromNode(api);
    if (mountedRef.current) {
      setNetwork(null);
      setState('disconnected');
      setError(null);
    }
  }, []);

  // Connect on mount, and close the socket when the page goes away.
  useEffect(() => {
    void connect();

    const onUnload = () => {
      attemptRef.current += 1;
      const api = apiRef.current;
      apiRef.current = null;
      void disconnectFromNode(api);
    };

    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      onUnload();
    };
    // Intentionally connect once per endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  return {
    state,
    error,
    network,
    busy,
    getApi: () => apiRef.current,
    connect,
    disconnect,
  };
}

export { EMPTY_NETWORK };
