/**
 * ChainRelay Web — node connection and network introspection.
 *
 * Everything here is read-only: the dashboard opens a WebSocket subscription
 * to the node and issues RPC queries. It never signs, broadcasts or submits
 * anything.
 */

import { ApiPromise, WsProvider } from '@polkadot/api';

/** Default endpoint: the official Portaldot V3 testnet. */
export const DEFAULT_WS_URL = 'wss://test-node-v3.portaldot.dev';

/**
 * Values expected on the official V3 testnet. These are expectations used to
 * report a mismatch, never a substitute for a live query.
 */
export const EXPECTED_NETWORK = {
  chain: 'PortaldotV3 Test',
  specName: 'portaldot-v3',
  specVersion: '3002',
  tokenSymbol: 'tPOT',
  tokenDecimals: 14,
  ss58Prefix: 42,
  evmChainId: '420420777',
  genesisHash: '0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd',
} as const;

export interface NetworkSnapshot {
  chain: string | null;
  nodeName: string | null;
  nodeVersion: string | null;
  blockHeight: string | null;
  specName: string | null;
  specVersion: string | null;
  implVersion: string | null;
  transactionVersion: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  ss58Prefix: number | null;
  genesisHash: string | null;
}

export interface NetworkMismatch {
  field: string;
  expected: string;
  observed: string;
}

export const EMPTY_NETWORK: NetworkSnapshot = {
  chain: null,
  nodeName: null,
  nodeVersion: null,
  blockHeight: null,
  specName: null,
  specVersion: null,
  implVersion: null,
  transactionVersion: null,
  tokenSymbol: null,
  tokenDecimals: null,
  ss58Prefix: null,
  genesisHash: null,
};

function unwrapOption<T>(option: unknown): T | null {
  if (option && typeof option === 'object' && 'isSome' in option) {
    const opt = option as { isSome: boolean; unwrap: () => T };
    return opt.isSome ? opt.unwrap() : null;
  }
  return null;
}

/**
 * Query the connected node for current network information.
 */
export async function readNetworkSnapshot(api: ApiPromise): Promise<NetworkSnapshot> {
  const [chain, nodeName, nodeVersion, genesisHash, header, properties] =
    await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
      api.rpc.chain.getBlockHash(0),
      api.rpc.chain.getHeader(),
      api.rpc.system.properties(),
    ]);

  const runtime = api.runtimeVersion;

  const tokenSymbols = unwrapOption<string[]>(properties?.tokenSymbol);
  const tokenDecimals = unwrapOption<number[]>(properties?.tokenDecimals);
  const ss58Format = unwrapOption<number>(properties?.ss58Format);

  return {
    chain: chain ? chain.toString() : null,
    nodeName: nodeName ? nodeName.toString() : null,
    nodeVersion: nodeVersion ? nodeVersion.toString() : null,
    blockHeight: header?.number ? header.number.toString() : null,
    specName: runtime?.specName ? runtime.specName.toString() : null,
    specVersion: runtime?.specVersion ? runtime.specVersion.toString() : null,
    implVersion: runtime?.implVersion ? runtime.implVersion.toString() : null,
    transactionVersion: runtime?.transactionVersion
      ? runtime.transactionVersion.toString()
      : null,
    tokenSymbol: tokenSymbols && tokenSymbols.length > 0 ? tokenSymbols[0] : null,
    tokenDecimals:
      tokenDecimals && tokenDecimals.length > 0 ? Number(tokenDecimals[0]) : null,
    ss58Prefix: ss58Format === null ? null : Number(ss58Format),
    genesisHash: genesisHash ? genesisHash.toHex() : null,
  };
}

/**
 * Compare a live snapshot against the expected V3 values.
 */
export function diffNetwork(
  snapshot: NetworkSnapshot,
): NetworkMismatch[] {
  const mismatches: NetworkMismatch[] = [];

  const check = (
    field: keyof NetworkSnapshot,
    expected: string | number,
    observed: string | number | null | undefined,
  ) => {
    if (observed === null || observed === undefined || observed === '') {
      return;
    }
    if (String(observed) !== String(expected)) {
      mismatches.push({ field, expected: String(expected), observed: String(observed) });
    }
  };

  check('chain', EXPECTED_NETWORK.chain, snapshot.chain);
  check('specName', EXPECTED_NETWORK.specName, snapshot.specName);
  check('specVersion', EXPECTED_NETWORK.specVersion, snapshot.specVersion);
  check('tokenSymbol', EXPECTED_NETWORK.tokenSymbol, snapshot.tokenSymbol);
  check('tokenDecimals', EXPECTED_NETWORK.tokenDecimals, snapshot.tokenDecimals);
  check('ss58Prefix', EXPECTED_NETWORK.ss58Prefix, snapshot.ss58Prefix);
  check('genesisHash', EXPECTED_NETWORK.genesisHash, snapshot.genesisHash);

  return mismatches;
}

/**
 * Open a read-only connection to a Substrate node.
 *
 * Rejects with a descriptive error on failure or timeout so the UI can show
 * the actual reason instead of pretending to be connected.
 */
export async function connectToNode(
  url: string,
  timeoutMs = 25000,
): Promise<ApiPromise> {
  if (!url || typeof url !== 'string' || !/^wss?:\/\//i.test(url.trim())) {
    throw new Error(`Invalid WebSocket endpoint: ${url || '(empty)'}`);
  }

  const provider = new WsProvider(url);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const api = await Promise.race([
      ApiPromise.create({ provider }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Connection to ${url} timed out after ${Math.round(timeoutMs / 1000)}s. The node did not complete the WebSocket handshake.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
    return api;
  } catch (err) {
    try {
      await provider.disconnect();
    } catch {
      // The provider may already be closed; nothing to recover here.
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Close a connection cleanly.
 */
export async function disconnectFromNode(api: ApiPromise | null): Promise<void> {
  if (!api) {
    return;
  }
  try {
    await api.disconnect();
  } catch {
    // Disconnect failures must never surface as an application error.
  }
}
