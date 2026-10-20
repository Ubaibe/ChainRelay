#!/usr/bin/env node
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { inspectAccounts, constructTransferCall, estimateCallFee } = require('../src/executor');
const { runPreflightChecks } = require('../src/preflight');

async function main() {
  const wsUrl = process.env.PORTALDOT_WS_URL || 'wss://test-node-v3.portaldot.dev';
  console.log('Connecting to: ' + wsUrl);
  const provider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider: provider });
  try {
    const signer = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
    const recipient = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
    console.log('\n--- Account Inspection ---');
    const inspected = await inspectAccounts({ signer: signer, recipient: recipient }, api);
    console.log('signer:', inspected.signer.address);
    console.log('free:', inspected.signer.free);
    console.log('reserved:', inspected.signer.reserved);
    console.log('miscFrozen:', inspected.signer.miscFrozen);
    console.log('feeFrozen:', inspected.signer.feeFrozen);
    console.log('frozen:', inspected.signer.frozen);
    console.log('flags:', inspected.signer.flags);
    console.log('frozenBreakdownKnown:', inspected.signer.frozenBreakdownKnown);
    console.log('\n--- Call ---');
    const intent = { action: 'transferKeepAlive', recipient: recipient, amount: '0.01', signer: signer };
    const callDesc = constructTransferCall(intent, api);
    console.log(callDesc.pallet + '.' + callDesc.method);
    console.log('amount:', callDesc.amount);
    console.log('\n--- Fee ---');
    const fee = await estimateCallFee(callDesc.call, signer, api);
    console.log('method:', fee.method);
    console.log('partialFee:', fee.partialFee);
    const pre = await runPreflightChecks({ intent: intent, feeEstimate: fee, accounts: inspected }, api);
    console.log('\n--- Preflight ---');
    console.log('ok:', pre.ok);
    console.log('errors:', pre.errors.length);
    console.log('warnings:', pre.warnings.length);
  } finally {
    await api.disconnect();
    console.log('\nDisconnected');
  }
}
main().catch(function(e){ console.error('err'); process.exit(1); });

