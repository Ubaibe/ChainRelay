export interface SignerLike {
  signPayload?: unknown;
  signRaw?: unknown;
}

export interface SignerInterfaceStatus {
  hasSignPayload: boolean;
  hasSignRaw: boolean;
  interfaceDetected: boolean;
  verified: false;
  note: string;
}

export function inspectSignerInterface(signer: unknown): SignerInterfaceStatus {
  const hasSignPayload =
    typeof (signer as { signPayload?: unknown } | null)?.signPayload === 'function';
  const hasSignRaw =
    typeof (signer as { signRaw?: unknown } | null)?.signRaw === 'function';
  return {
    hasSignPayload,
    hasSignRaw,
    interfaceDetected: hasSignPayload || hasSignRaw,
    verified: false,
    note:
      'Method presence is interface detection only. Signing compatibility is not verified until an explicit, user-approved signing test is performed.',
  };
}

export interface UnsignedPayload {
  pallet: 'balances';
  method: 'transferKeepAlive';
  recipient: string;
  amount: string;
}

export function buildUnsignedPayload(
  recipient: unknown,
  amount: unknown,
): UnsignedPayload {
  if (typeof recipient !== 'string' || recipient.trim() === '') {
    throw new Error('recipient must be a non-empty string');
  }
  if (typeof amount !== 'string' || amount.trim() === '') {
    throw new Error('amount must be a non-empty string');
  }
  if (!/^\d+(\.\d+)?$/.test(amount.trim())) {
    throw new Error('amount must be a decimal string');
  }
  return {
    pallet: 'balances',
    method: 'transferKeepAlive',
    recipient: recipient.trim(),
    amount: amount.trim(),
  };
}
