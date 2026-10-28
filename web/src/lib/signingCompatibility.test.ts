import { describe, expect, it } from 'vitest';
import {
  buildUnsignedPayload,
  inspectSignerInterface,
} from './signingCompatibility';

describe('signingCompatibility', () => {
  it('detects missing signer', () => {
    const status = inspectSignerInterface(null);
    expect(status.interfaceDetected).toBe(false);
    expect(status.verified).toBe(false);
  });

  it('detects missing methods', () => {
    const status = inspectSignerInterface({});
    expect(status.hasSignPayload).toBe(false);
    expect(status.hasSignRaw).toBe(false);
    expect(status.verified).toBe(false);
  });

  it('detects method presence without claiming verification', () => {
    const status = inspectSignerInterface({ signPayload: () => undefined });
    expect(status.hasSignPayload).toBe(true);
    expect(status.verified).toBe(false);
  });

  it('builds an unsigned payload', () => {
    const payload = buildUnsignedPayload('5Grw...', '1.5');
    expect(payload.method).toBe('transferKeepAlive');
    expect(payload.amount).toBe('1.5');
  });

  it('rejects malformed payload inputs', () => {
    expect(() => buildUnsignedPayload('', '1')).toThrow();
    expect(() => buildUnsignedPayload('addr', '')).toThrow();
    expect(() => buildUnsignedPayload('addr', 'abc')).toThrow();
  });
});
