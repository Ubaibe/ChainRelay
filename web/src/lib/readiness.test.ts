import { describe, expect, it } from 'vitest';
import type { ApiPromise } from '@polkadot/api';

import { runReadinessCheck, validateInputs } from '../lib/readiness';

const VALID_SENDER = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const VALID_RECIPIENT = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';

describe('validateInputs', () => {
  it('accepts valid inputs', () => {
    const result = validateInputs({
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '1.5',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects an invalid sender address', () => {
    const result = validateInputs({
      sender: 'not-an-address',
      recipient: VALID_RECIPIENT,
      amount: '1',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Invalid SS58 address/);
  });

  it('rejects an invalid recipient address', () => {
    const result = validateInputs({
      sender: VALID_SENDER,
      recipient: 'not-an-address',
      amount: '1',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Invalid SS58 address/);
  });

  it('rejects a zero amount', () => {
    const result = validateInputs({
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '0',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/greater than zero/);
  });

  it('rejects a negative amount', () => {
    const result = validateInputs({
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '-1',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects an amount with too much precision', () => {
    const result = validateInputs({
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '0.000000000000001',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/precision/);
  });

  it('rejects a missing sender', () => {
    const result = validateInputs({
      sender: '',
      recipient: VALID_RECIPIENT,
      amount: '1',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/signer/i);
  });

  it('rejects an address that does not match the network prefix', () => {
    const result = validateInputs({
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '1',
      ss58Prefix: 2,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/SS58 prefix 2/);
  });

  it('notes a self transfer without rejecting it', () => {
    const result = validateInputs({
      sender: VALID_SENDER,
      recipient: VALID_SENDER,
      amount: '1',
      ss58Prefix: 42,
    });
    expect(result.valid).toBe(true);
    expect(result.notes.join(' ')).toMatch(/self-transfer/);
  });

  it('returns no intent when the inputs are invalid', () => {
    const result = validateInputs({
      sender: 'bad',
      recipient: VALID_RECIPIENT,
      amount: '1',
      ss58Prefix: 42,
    });
    expect(result.intent).toBeNull();
  });
});

/**
 * Minimal stand-in for the parts of the Polkadot API the readiness workflow
 * touches. It returns fixed values, so the assertions below are about how the
 * dashboard *interprets* a result, not about live chain state.
 */
interface FakeAccount {
  free: bigint;
  reserved: bigint;
  frozen?: bigint;
  miscFrozen?: bigint;
  feeFrozen?: bigint;
}

function createFakeApi(options: {
  signer: FakeAccount;
  recipient: FakeAccount;
  partialFee: bigint;
  dryRun: 'BadOrigin' | 'Ok' | 'RpcError';
}) {
  const account = (data: FakeAccount) => ({
    data: {
      free: data.free,
      reserved: data.reserved,
      ...(data.frozen === undefined ? {} : { frozen: data.frozen }),
      ...(data.miscFrozen === undefined ? {} : { miscFrozen: data.miscFrozen }),
      ...(data.feeFrozen === undefined ? {} : { feeFrozen: data.feeFrozen }),
      flags: 0n,
    },
  });

  return {
    query: {
      system: {
        account: async (address: string) =>
          account(address === VALID_SENDER ? options.signer : options.recipient),
      },
    },
    tx: {
      balances: {
        transferKeepAlive: (recipient: string, amount: bigint) => ({
          toHex: () => `0x${recipient.slice(0, 4)}${amount.toString(16)}`,
          method: { section: 'balances', method: 'transferKeepAlive' },
          args: [recipient, amount],
          paymentInfo: async () => ({
            partialFee: options.partialFee,
            weight: 656445000n,
            class: 'normal',
            paysFee: 'Yes',
          }),
        }),
      },
    },
    rpc: {
      chain: {
        getFinalizedHead: async () => ({ toHex: () => '0xdeadbeef' }),
      },
      system: {
        dryRun: async () => ({
          toHuman: () => {
            if (options.dryRun === 'RpcError') {
              return { Err: 'Method not found' };
            }
            if (options.dryRun === 'Ok') {
              return { Ok: { Ok: { actual: 'Success' } } };
            }
            return { Ok: { Err: 'BadOrigin' } };
          },
        }),
      },
    },
  };
}

const asApi = (fake: ReturnType<typeof createFakeApi>) =>
  fake as unknown as ApiPromise;

describe('runReadinessCheck result interpretation', () => {
  it('marks every live check as NOT CHECKED when the inputs are invalid', async () => {
    const result = await runReadinessCheck(asApi(createFakeApi({
      signer: { free: 0n, reserved: 0n, frozen: 0n },
      recipient: { free: 0n, reserved: 0n, frozen: 0n },
      partialFee: 1n,
      dryRun: 'BadOrigin',
    })), {
      sender: VALID_SENDER,
      recipient: 'not-an-address',
      amount: '1',
      ss58Prefix: 42,
    });

    expect(result.validation.status).toBe('ERROR');
    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(result.account.status).toBe('NOT_CHECKED');
    expect(result.construct.status).toBe('NOT_CHECKED');
    expect(result.fee.status).toBe('NOT_CHECKED');
    expect(result.readiness.status).toBe('NOT_CHECKED');
    expect(result.simulation.status).toBe('NOT_CHECKED');
    expect(result.preview).toBeNull();
  });

  it('warns when the runtime does not expose a frozen-balance breakdown', async () => {
    const result = await runReadinessCheck(asApi(createFakeApi({
      signer: { free: 1000000000000000n, reserved: 0n, frozen: 0n },
      recipient: { free: 0n, reserved: 0n, frozen: 0n },
      partialFee: 1480577822974n,
      dryRun: 'BadOrigin',
    })), {
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '0.01',
      ss58Prefix: 42,
    });

    expect(result.validation.status).toBe('PASS');
    expect(result.account.status).toBe('WARNING');
    expect(result.account.signer?.frozenBreakdownKnown).toBe(false);
    expect(result.construct.status).toBe('PASS');
    expect(result.fee.status).toBe('PASS');
    expect(result.fee.estimate?.method).toBe('paymentInfo');
    expect(result.fee.estimate?.partialFee).toBe('1480577822974');
    expect(result.readiness.status).toBe('WARNING');
    expect(result.simulation.status).toBe('WARNING');
    expect(result.simulation.result?.dispatchError).toBe('BadOrigin');
    expect(result.warnings.join(' ')).toMatch(/frozen balance breakdown/i);
  });

  it('does not raise a frozen-breakdown warning on a legacy account shape', async () => {
    const result = await runReadinessCheck(asApi(createFakeApi({
      signer: { free: 1000000000000000n, reserved: 0n, miscFrozen: 0n, feeFrozen: 0n },
      recipient: { free: 0n, reserved: 0n, miscFrozen: 0n, feeFrozen: 0n },
      partialFee: 1480577822974n,
      dryRun: 'BadOrigin',
    })), {
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '0.01',
      ss58Prefix: 42,
    });

    expect(result.account.status).toBe('PASS');
    expect(result.account.signer?.frozenBreakdownKnown).toBe(true);
    expect(result.warnings.join(' ')).not.toMatch(/frozen balance breakdown/i);
  });

  it('reports an error when the balance cannot cover amount plus fee', async () => {
    const result = await runReadinessCheck(asApi(createFakeApi({
      signer: { free: 1000n, reserved: 0n, frozen: 0n },
      recipient: { free: 0n, reserved: 0n, frozen: 0n },
      partialFee: 1480577822974n,
      dryRun: 'BadOrigin',
    })), {
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '1',
      ss58Prefix: 42,
    });

    expect(result.readiness.status).toBe('ERROR');
    expect(result.readiness.headline).toMatch(/does not cover/i);
  });

  it('passes the simulation only when the runtime dispatches the call', async () => {
    const result = await runReadinessCheck(asApi(createFakeApi({
      signer: { free: 1000000000000000n, reserved: 0n, frozen: 0n },
      recipient: { free: 0n, reserved: 0n, frozen: 0n },
      partialFee: 1480577822974n,
      dryRun: 'Ok',
    })), {
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '0.01',
      ss58Prefix: 42,
    });

    expect(result.simulation.status).toBe('PASS');
    expect(result.simulation.result?.dispatchOk).toBe(true);
  });

  it('reports an RPC-level dry-run failure as an error', async () => {
    const result = await runReadinessCheck(asApi(createFakeApi({
      signer: { free: 1000000000000000n, reserved: 0n, frozen: 0n },
      recipient: { free: 0n, reserved: 0n, frozen: 0n },
      partialFee: 1480577822974n,
      dryRun: 'RpcError',
    })), {
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '0.01',
      ss58Prefix: 42,
    });

    expect(result.simulation.status).toBe('ERROR');
    expect(result.simulation.result?.rpcOk).toBe(false);
  });

  it('previews the exact base-unit amount that was checked', async () => {
    const result = await runReadinessCheck(asApi(createFakeApi({
      signer: { free: 1000000000000000n, reserved: 0n, frozen: 0n },
      recipient: { free: 0n, reserved: 0n, frozen: 0n },
      partialFee: 1480577822974n,
      dryRun: 'BadOrigin',
    })), {
      sender: VALID_SENDER,
      recipient: VALID_RECIPIENT,
      amount: '0.01',
      ss58Prefix: 42,
    });

    expect(result.preview?.pallet).toBe('balances');
    expect(result.preview?.method).toBe('transferKeepAlive');
    expect(result.preview?.amountBaseUnits).toBe('1000000000000');
    expect(result.preview?.callHex).toMatch(/^0x/);
  });
});
