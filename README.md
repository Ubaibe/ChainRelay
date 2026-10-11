# ChainRelay Recon

Offline read-only execution pipeline for Portaldot/Substrate chains. Simulates balance transfers without signing or submitting transactions.

## Purpose

ChainRelay Recon lets you validate and simulate balance transfer intents (transfer, transferKeepAlive, transferAll) against a live or mocked Substrate runtime. It performs:

1. **Intent validation** - SS58 address checks, amount bounds, deadline validation
2. **Execution planning** - Determines call construction, fee estimation method
3. **Preflight checks** - Balance sufficiency, account existence, frozen balances
4. **Fee estimation** - Via `paymentInfo` or `rpc.payment.queryInfo`
5. **Dry-run simulation** - Via `rpc.system.dryRun` (no state changes)
6. **Structured receipt** - JSON-serializable outcome with all evidence

## Capabilities

- Validates transfer, transferKeepAlive, and transferAll intents
- Handles 14-decimal precision amounts (Portaldot/POT)
- Preflight balance checks including reserved/miscFrozen/feeFrozen
- Fee estimation via extrinsic.paymentInfo (preferred) or RPC fallback
- Dry-run simulation without signing or submitting
- Structured receipts with execution status: PLANNED, FEE_ESTIMATED, SIMULATION_PASSED, SIMULATION_FAILED
- Malformed account detection in pre-fetched data
- Fully offline operation with mocked dependencies

## Limitations

- **No transaction signing or submission** - This is a read-only simulation tool
- **Dry-run ≠ execution guarantee** - Simulation passes do not ensure on-chain success
- **Fee estimates are estimates** - Actual fees may differ (tip, weight changes, runtime upgrades)
- **BadOrigin in dry-run** - Unsigned extrinsics fail dry-run on pallets requiring signed origin (expected)
- **No network access required** - Works entirely with mocked API for testing/demo
- **Portaldot-specific** - Built for 14-decimal POT asset, SS58 prefix 42

## Quick Start

```bash
# Install dependencies
npm install

# Run tests (122 tests, all offline)
npm test

# Run offline demo
npm run demo
```

## Demo Output

The demo runs two scenarios:

1. **Scenario A**: Controlled simulation success - Shows full pipeline passing through SIMULATION_PASSED
2. **Scenario B**: BadOrigin failure - Shows Portaldot-style failure where unsigned dry-run fails on balances pallet

Both scenarios use mocked dependencies - no network, no signing, no submission.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for pipeline diagram and component details.

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for test commands, adding tests, and pipeline extension points.

## Project Structure

```
src/
  intent.js          # Intent creation & validation
  plan.js            # Execution plan builder
  preflight.js       # Balance & account preflight checks
  executor.js        # Fee estimation & dry-run simulation
  pipeline.js        # Pipeline orchestration
  receipt.js         # Receipt builder
test/
  intent.test.js     # Intent validation tests
  plan.test.js       # Plan builder tests
  preflight.test.js  # Preflight checks (64 tests)
  executor.test.js   # (not yet created - fee estimation coverage gap)
  pipeline.test.js   # Integration tests (22 tests)
  receipt.test.js    # Receipt builder tests
scripts/
  demo.js            # Offline demonstration script
docs/
  ARCHITECTURE.md    # Pipeline diagram & component docs
  DEVELOPMENT.md     # Development guide
```

## API Usage (Library)

```javascript
const { runExecutionPipeline } = require('./src/pipeline');
const { createIntent } = require('./src/intent');

// Create and validate intent
const intentResult = createIntent({
  action: 'transferKeepAlive',
  asset: 'POT',
  amount: '1.5',
  recipient: '5CShbTqxKUgKZBRDu1VGVpivm3m415stz86A5GBdoV7wrU1d',
  signer: '5H728gLgx4yuCSVEwGCAfLo3RtzTau9F6cTNqNJtrqqjACWq',
});

// Run pipeline (provide mocked or real API)
const result = await runExecutionPipeline({
  intent: intentResult.intent,
  api: mockedApi,  // or real Polkadot API
});

console.log(result.ok);        // true/false
console.log(result.stage);     // PREFLIGHT, SIMULATION, etc.
console.log(result.receipt);   // Structured receipt object
```

## Exit Statuses

| Stage | Description |
|-------|-------------|
| VALIDATION | Intent rejected |
| CALL_CONSTRUCTION | Call building failed |
| FEE_ESTIMATION | Fee estimation failed |
| PREFLIGHT | Balance/account check failed |
| SIMULATION | Dry-run executed |
| SIMULATION_PASSED | Dry-run succeeded |
| SIMULATION_FAILED | Dry-run failed (e.g., BadOrigin) |
| RECEIPT | Receipt building failed |

## Receipt Statuses

| Status | Meaning |
|--------|---------|
| PLANNED | Valid intent, no fee/dry-run |
| FEE_ESTIMATED | Fee estimated, no dry-run |
| SIMULATION_PASSED | Dry-run succeeded |
| SIMULATION_FAILED | Dry-run failed |

## Testing

```bash
# All tests
npm test

# Single test file
node --test test/preflight.test.js

# With coverage (if configured)
npm test -- --experimental-test-coverage
```

## License

ISC