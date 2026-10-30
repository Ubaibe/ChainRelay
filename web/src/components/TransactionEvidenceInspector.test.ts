import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TransactionEvidenceInspector } from './TransactionEvidenceInspector';
import { buildTransactionReadinessPassport } from '../lib/passport';

describe('TransactionEvidenceInspector', () => {
  it('renders categories and unavailable EVM evidence', () => {
    const passport = buildTransactionReadinessPassport({
      network: null,
      expectedGenesisHash: null,
      walletAddress: null,
      walletConnected: false,
      decimals: 14,
      result: null,
      revealAddresses: false,
    });
    const html = renderToStaticMarkup(createElement(TransactionEvidenceInspector, { passport }));
    expect(html).toContain('Evidence inspector');
    expect(html).toContain('EVM (');
    expect(html).toContain('UNAVAILABLE');
    expect(html).toContain('INCONCLUSIVE');
  });
});
