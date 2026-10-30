export type EvmIdentityStatus = 'VERIFIED' | 'FAILED' | 'UNAVAILABLE' | 'INCONCLUSIVE';

export interface EvmIdentitySnapshot {
  status: EvmIdentityStatus;
  chainId: string | null;
  chainIdDecimal: string | null;
  genesisBlockNumber: string | null;
  genesisBlockHash: string | null;
  observedAt: number | null;
  evidence: string | null;
  explanation: string;
}

export interface ReadEvmIdentityOptions {
  endpoint?: string | null;
  expectedChainId?: bigint | number | string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const EXPECTED_EVM_CHAIN_ID = 420420777n;

const DEFAULT_TIMEOUT_MS = 10000;
const EVM_GENESIS_BLOCK = '0x0';

function resolveEndpoint(options: ReadEvmIdentityOptions): string | null {
  const endpoint = options.endpoint ?? (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_PORTALDOT_EVM_RPC_URL : null);
  if (typeof endpoint !== 'string') {
    return null;
  }
  const trimmed = endpoint.trim();
  return trimmed === '' ? null : trimmed;
}

function resolveExpectedChainId(value: ReadEvmIdentityOptions['expectedChainId']): bigint {
  if (value === undefined) {
    return EXPECTED_EVM_CHAIN_ID;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      return BigInt(trimmed);
    }
    return BigInt(trimmed);
  }
  return EXPECTED_EVM_CHAIN_ID;
}

function normalizeChainId(value: unknown): string | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null;
  }
  try {
    return `0x${BigInt(value).toString(16)}`;
  } catch {
    return null;
  }
}

function normalizeBlockHash(value: unknown): string | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function normalizeBlockNumber(value: unknown): string | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null;
  }
  try {
    return `0x${BigInt(value).toString(16)}`;
  } catch {
    return null;
  }
}

function unavailable(evidence: string, explanation: string): EvmIdentitySnapshot {
  return {
    status: 'UNAVAILABLE',
    chainId: null,
    chainIdDecimal: null,
    genesisBlockNumber: null,
    genesisBlockHash: null,
    observedAt: null,
    evidence,
    explanation,
  };
}

async function postJsonRpc(
  endpoint: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ id: string; result: unknown }> {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `evm-${Date.now()}-${Math.random()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('timeout');
    }
    throw new Error('network');
  }

  clearTimeout(timer);

  if (!response.ok) {
    throw new Error('http');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('invalid-json');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid-rpc');
  }

  const rpc = payload as { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown };
  if (rpc.jsonrpc !== '2.0') {
    throw new Error('invalid-version');
  }
  if (rpc.id !== id) {
    throw new Error('mismatched-id');
  }
  if (rpc.error !== undefined && rpc.error !== null) {
    throw new Error('rpc-error');
  }
  if (!('result' in rpc)) {
    throw new Error('missing-result');
  }

  return { id, result: rpc.result };
}

export async function readEvmIdentity(
  endpointOrOptions?: string | ReadEvmIdentityOptions,
  options: ReadEvmIdentityOptions = {},
): Promise<EvmIdentitySnapshot> {
  const resolvedOptions =
    typeof endpointOrOptions === 'string'
      ? { ...options, endpoint: endpointOrOptions }
      : { ...options, ...endpointOrOptions };

  const endpoint = resolveEndpoint(resolvedOptions);
  if (!endpoint) {
    return unavailable('missing-endpoint', 'No EVM RPC endpoint is configured.');
  }

  const expectedChainId = resolveExpectedChainId(resolvedOptions.expectedChainId);
  const timeoutMs = resolvedOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = resolvedOptions.fetchImpl ?? fetch;
  const observedAt = Date.now();

  let chainIdResult: unknown;
  try {
    const response = await postJsonRpc(endpoint, 'eth_chainId', [], timeoutMs, fetchImpl);
    chainIdResult = response.result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'timeout') {
      return unavailable('timeout', 'The EVM RPC request timed out.');
    }
    if (message === 'http') {
      return unavailable('http-error', 'The EVM RPC endpoint returned an HTTP error.');
    }
    if (message === 'invalid-json') {
      return unavailable('invalid-json', 'The EVM RPC response was not valid JSON.');
    }
    if (message === 'invalid-version') {
      return unavailable('invalid-jsonrpc-version', 'The EVM RPC response used an invalid JSON-RPC version.');
    }
    if (message === 'mismatched-id') {
      return unavailable('mismatched-id', 'The EVM RPC response ID did not match the request ID.');
    }
    if (message === 'rpc-error') {
      return unavailable('rpc-error', 'The EVM RPC endpoint returned an error.');
    }
    return unavailable('network-error', 'The EVM RPC request could not be completed.');
  }

  const normalizedChainId = normalizeChainId(chainIdResult);
  if (normalizedChainId === null) {
    return unavailable('invalid-chain-id', 'The EVM chain ID was not a valid hexadecimal quantity.');
  }

  const chainIdDecimal = BigInt(normalizedChainId).toString();

  let genesisResult: unknown;
  try {
    const response = await postJsonRpc(endpoint, 'eth_getBlockByNumber', [EVM_GENESIS_BLOCK, false], timeoutMs, fetchImpl);
    genesisResult = response.result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'timeout') {
      return unavailable('timeout', 'The EVM genesis block request timed out.');
    }
    if (message === 'http') {
      return unavailable('http-error', 'The EVM RPC endpoint returned an HTTP error.');
    }
    if (message === 'invalid-json') {
      return unavailable('invalid-json', 'The EVM RPC response was not valid JSON.');
    }
    if (message === 'invalid-version') {
      return unavailable('invalid-jsonrpc-version', 'The EVM RPC response used an invalid JSON-RPC version.');
    }
    if (message === 'mismatched-id') {
      return unavailable('mismatched-id', 'The EVM RPC response ID did not match the request ID.');
    }
    if (message === 'rpc-error') {
      return unavailable('rpc-error', 'The EVM RPC endpoint returned an error.');
    }
    return unavailable('network-error', 'The EVM RPC request could not be completed.');
  }

  if (!genesisResult || typeof genesisResult !== 'object' || Array.isArray(genesisResult)) {
    return unavailable('missing-genesis-block', 'The EVM genesis block was not returned.');
  }

  const genesis = genesisResult as { number?: unknown; hash?: unknown };
  const genesisBlockNumber = normalizeBlockNumber(genesis.number);
  const genesisBlockHash = normalizeBlockHash(genesis.hash);

  if (genesisBlockNumber === null) {
    return unavailable('invalid-genesis-block-number', 'The EVM genesis block number was malformed.');
  }
  if (genesisBlockHash === null) {
    return unavailable('invalid-genesis-block-hash', 'The EVM genesis block hash was malformed.');
  }

  const chainIdMatches = BigInt(normalizedChainId) === expectedChainId;

  return {
    status: chainIdMatches ? 'VERIFIED' : 'FAILED',
    chainId: normalizedChainId,
    chainIdDecimal,
    genesisBlockNumber,
    genesisBlockHash,
    observedAt,
    evidence: `chainId=${normalizedChainId}; genesisBlockNumber=${genesisBlockNumber}; genesisBlockHash=${genesisBlockHash}`,
    explanation: chainIdMatches
      ? 'The configured EVM endpoint returned the expected chain ID and a readable genesis block.'
      : 'The configured EVM endpoint returned a chain ID that differs from the expected EVM chain ID.',
  };
}
