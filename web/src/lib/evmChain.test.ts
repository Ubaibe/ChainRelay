import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readEvmIdentity,
} from './evmChain';

const ENDPOINT = 'https://example.invalid/rpc?token=secret';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('readEvmIdentity', () => {
  it('verifies a valid chain ID and genesis block', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_chainId') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x190f1ca9' });
      }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { number: '0x0', hash: '0x' + '1'.repeat(64) } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('VERIFIED');
    expect(result.chainId).toBe('0x190f1ca9');
    expect(result.chainIdDecimal).toBe('420420777');
    expect(result.genesisBlockNumber).toBe('0x0');
    expect(result.genesisBlockHash).toBe('0x' + '1'.repeat(64));
  });

  it('fails when the chain ID differs from the expected value', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_chainId') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x1' });
      }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { number: '0x0', hash: '0x' + '2'.repeat(64) } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('FAILED');
    expect(result.chainId).toBe('0x1');
  });

  it('returns unavailable when the endpoint is missing', async () => {
    const result = await readEvmIdentity({ endpoint: null });
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('missing-endpoint');
  });

  it('returns unavailable when the endpoint is empty', async () => {
    const result = await readEvmIdentity({ endpoint: '   ' });
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('missing-endpoint');
  });

  it('returns unavailable on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('http-error');
  });

  it('returns unavailable on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('network-error');
  });

  it('aborts and returns unavailable on timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const promise = readEvmIdentity({ endpoint: ENDPOINT, timeoutMs: 5 });
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('timeout');
  });

  it('returns unavailable on invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{bad', { status: 200 })));
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('invalid-json');
  });

  it('returns unavailable on invalid JSON-RPC version', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: '1.0', id: body.id, result: '0x1' });
    }));
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('invalid-jsonrpc-version');
  });

  it('returns unavailable on mismatched response ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      return jsonResponse({ jsonrpc: '2.0', id: 'different', result: '0x1' });
    }));
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('mismatched-id');
  });

  it('returns unavailable on JSON-RPC error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'boom' } });
    }));
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('rpc-error');
  });

  it('returns unavailable on invalid chain ID format', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: 'not-hex' });
    }));
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('invalid-chain-id');
  });

  it('returns unavailable when genesis block is missing', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_chainId') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x190f1ca9' });
      }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: null });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('missing-genesis-block');
  });

  it('returns unavailable on malformed genesis block number', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_chainId') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x190f1ca9' });
      }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { number: 'bad', hash: '0x' + '3'.repeat(64) } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('invalid-genesis-block-number');
  });

  it('returns unavailable on malformed genesis block hash', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.method === 'eth_chainId') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x190f1ca9' });
      }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { number: '0x0', hash: '0x1234' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await readEvmIdentity(ENDPOINT);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.evidence).toBe('invalid-genesis-block-hash');
  });

  it('does not expose sensitive endpoint query parameters in errors or output', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    const result = await readEvmIdentity(ENDPOINT);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret');
    expect(result.explanation).not.toContain('secret');
    expect(result.evidence).not.toContain('secret');
  });
});
