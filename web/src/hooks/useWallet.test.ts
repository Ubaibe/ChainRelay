import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';

const MOCK_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

// Hoisted variables are available inside vi.mock factories.
const mockWeb3Enable = vi.hoisted(() => vi.fn());
const mockWeb3Accounts = vi.hoisted(() => vi.fn());
const mockWeb3FromAddress = vi.hoisted(() => vi.fn());
const mockIsWeb3Injected = vi.hoisted(() => ({ value: false }));

const mockAccount: InjectedAccountWithMeta = {
  address: MOCK_ADDRESS,
  meta: { source: 'portaldot extension', name: 'Portaldot Extension', genesisHash: null },
  type: 'sr25519',
};

const mockSigner = {
  signPayload: vi.fn(),
  signRaw: vi.fn(),
};

const mockExtension = {
  name: 'portaldot extension',
  version: '0.2.0',
  accounts: {
    get: vi.fn(),
    subscribe: vi.fn(),
  },
  signer: mockSigner,
};

vi.mock('@polkadot/extension-dapp', () => ({
  web3Enable: mockWeb3Enable,
  web3Accounts: mockWeb3Accounts,
  web3FromAddress: mockWeb3FromAddress,
  get isWeb3Injected() {
    return mockIsWeb3Injected.value;
  },
}));

// Mock React hooks so useWallet can be invoked outside a component.
// Hook call order in useWallet:
// 0: useState status, 1: useState error, 2: useState accounts,
// 3: useState selectedAddress, 4: useState extensions,
// 5: useState signerAvailable, 6: useRef mountedRef,
// 7: useRef attemptRef, 8: useRef accountsRef,
// 9: useCallback connect, 10: useCallback disconnect,
// 11: useCallback selectAccount
let hookIndex = 0;
const hookStates: any[] = [];
const hookSetters: any[] = [];

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: any) => {
      const idx = hookIndex++;
      hookStates[idx] = initial;
      hookSetters[idx] = (val: any) => {
        hookStates[idx] = val;
      };
      return [hookStates[idx], hookSetters[idx]];
    },
    useCallback: (fn: any) => fn,
    useRef: (initial: any) => ({ current: initial }),
  };
});

import { useWallet } from '../hooks/useWallet';

function resetHooks() {
  hookIndex = 0;
  hookStates.length = 0;
  hookSetters.length = 0;
}

beforeEach(() => {
  vi.resetAllMocks();
  resetHooks();
});

// Helper: call connect and read updated state from hookStates.
async function connectWallet(wallet: any) {
  await wallet.connect();
  return {
    status: hookStates[0],
    error: hookStates[1],
    accounts: hookStates[2],
    selectedAddress: hookStates[3],
    extensions: hookStates[4],
    signerAvailable: hookStates[5],
  };
}

describe('useWallet — initial state', () => {
  it('starts disconnected with no accounts and no error', () => {
    mockIsWeb3Injected.value = false;
    const wallet = useWallet();
    expect(wallet.status).toBe('disconnected');
    expect(wallet.error).toBeNull();
    expect(wallet.accounts).toEqual([]);
    expect(wallet.selectedAddress).toBeNull();
    expect(wallet.extensionDetected).toBe(false);
    expect(wallet.signerAvailable).toBe(false);
  });

  it('reports extension detected when available', () => {
    mockIsWeb3Injected.value = true;
    const wallet = useWallet();
    expect(wallet.extensionDetected).toBe(true);
  });
});

describe('useWallet — connect flow', () => {
  it('sets error when no extension is detected', async () => {
    mockIsWeb3Injected.value = false;
    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[0]).toBe('error');
    expect(hookStates[1]).toContain('No injected Web3 wallet');
    expect(mockWeb3Enable).not.toHaveBeenCalled();
  });

  it('calls web3Enable with the dapp name', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([mockAccount]);
    mockWeb3FromAddress.mockResolvedValue(mockExtension);

    const wallet = useWallet();
    await wallet.connect();
    expect(mockWeb3Enable).toHaveBeenCalledWith('ChainRelay');
  });

  it('sets error when web3Enable returns no extensions', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([]);

    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[0]).toBe('error');
    expect(hookStates[1]).toContain('No wallet extension authorized');
  });

  it('sets error when no accounts are available', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([]);

    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[0]).toBe('error');
    expect(hookStates[1]).toContain('no accounts are available');
  });

  it('connects successfully and selects first account', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([mockAccount]);
    mockWeb3FromAddress.mockResolvedValue(mockExtension);

    const wallet = useWallet();
    const state = await connectWallet(wallet);
    expect(state.status).toBe('connected');
    expect(state.selectedAddress).toBe(MOCK_ADDRESS);
    expect(state.accounts).toHaveLength(1);
    expect(state.signerAvailable).toBe(true);
    expect(state.error).toBeNull();
  });

  it('marks signer unavailable when signer lookup fails', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([mockAccount]);
    mockWeb3FromAddress.mockRejectedValue(new Error('lookup failed'));

    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[0]).toBe('connected');
    expect(hookStates[5]).toBe(false);
  });

  it('does not invoke any signing method', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([mockAccount]);
    mockWeb3FromAddress.mockResolvedValue(mockExtension);

    const wallet = useWallet();
    await wallet.connect();
    expect(mockSigner.signPayload).not.toHaveBeenCalled();
    expect(mockSigner.signRaw).not.toHaveBeenCalled();
  });

  it('handles web3Enable throwing', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockRejectedValue(new Error('extension rejected'));

    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[0]).toBe('error');
    expect(hookStates[1]).toContain('extension rejected');
  });
});

describe('useWallet — disconnect', () => {
  it('clears all connection state on disconnect', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([mockAccount]);
    mockWeb3FromAddress.mockResolvedValue(mockExtension);

    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[0]).toBe('connected');

    wallet.disconnect();
    expect(hookStates[0]).toBe('disconnected');
    expect(hookStates[1]).toBeNull();
    expect(hookStates[2]).toEqual([]);
    expect(hookStates[3]).toBeNull();
    expect(hookStates[4]).toEqual([]);
    expect(hookStates[5]).toBe(false);
  });
});

describe('useWallet — selectAccount', () => {
  const second: InjectedAccountWithMeta = {
    address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
    meta: { source: 'portaldot extension', name: 'Portaldot Extension', genesisHash: null },
    type: 'ed25519',
  };

  it('selects a matching account from the list', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([mockAccount, second]);
    mockWeb3FromAddress.mockResolvedValue(mockExtension);

    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[0]).toBe('connected');
    expect(hookStates[3]).toBe(MOCK_ADDRESS);

    wallet.selectAccount(second.address);
    expect(hookStates[3]).toBe(second.address);
  });

  it('ignores unknown addresses', async () => {
    mockIsWeb3Injected.value = true;
    mockWeb3Enable.mockResolvedValue([mockExtension]);
    mockWeb3Accounts.mockResolvedValue([mockAccount]);
    mockWeb3FromAddress.mockResolvedValue(mockExtension);

    const wallet = useWallet();
    await wallet.connect();
    expect(hookStates[3]).toBe(MOCK_ADDRESS);

    wallet.selectAccount('5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWQ');
    expect(hookStates[3]).toBe(MOCK_ADDRESS);
  });
});
