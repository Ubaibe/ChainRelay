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

# Run tests (127 tests, all offline)
npm test

# Run offline demo
npm run demo

# Run network doctor (requires PORTALDOT_WS_URL)
PORTALDOT_WS_URL=wss://your-endpoint npm run doctor
```

## Network Doctor

The `doctor` script performs read-only verification of a Portaldot/Substrate endpoint. It connects to the configured WebSocket endpoint and reports chain identity, runtime version, token properties, available pallets, and API capabilities relevant to the execution pipeline.

```bash
# Set the endpoint and run
PORTALDOT_WS_URL=wss://your-endpoint npm run doctor
```

### Three Diagnostic Contexts

| Context | Endpoint Source | Purpose | V3.0 Verification |
|---------|----------------|---------|-------------------|
| **1. Mainnet diagnostics** | `wss://mainnet.portaldot.io` (hardcoded default in `src/chain.js`) | Inspect production chain state, pallets, runtime | Not applicable — mainnet is not the hackathon testnet |
| **2. Local development node** | `ws://127.0.0.1:9944` (or your local node) | Develop and test against a local Substrate node | Not applicable — local node runtime is controlled by developer |
| **3. Official hackathon testnet verification** | **Await organizer confirmation** — the official Portaldot V3.0 testnet WebSocket endpoint, expected `specName`, and `specVersion` | Verify the pipeline targets the correct V3.0 testnet | **Requires organizer-provided endpoint and expected runtime identifiers** |

> **Important**: A successful connection does **not** prove Portaldot V3.0 compatibility. V3.0 verification requires the organizer-confirmed testnet endpoint and matching `specName`/`specVersion` values. The pipeline's default connection (`src/chain.js`) points to mainnet and is **not** changed by this tool.

### Example Output

```
╔══════════════════════════════════════════════════════════════════╗
║                  ChainRelay Network Doctor                      ║
║              Read-only Portaldot endpoint verification          ║
╚══════════════════════════════════════════════════════════════════╝

Endpoint: wss://mainnet.portaldot.io

✓ Connected

CHAIN INFORMATION
-----------------
  Chain:          portaldot
  Node:           Substrate
  Node version:   1.0.0
  Genesis hash:   0xabc123...
  Current block:  #1234567

RUNTIME
-------
  Spec name:      portaldot
  Spec version:   3000
  Impl version:   1
  Authoring version: 1
  Transaction version: 1

CHAIN PROPERTIES
----------------
  SS58 prefix:    42
  Token symbol:   POT
  Token decimals: 14

AVAILABLE PALLETS
-----------------
  Extrinsic pallets (api.tx):    45
  Storage pallets (api.query):   52

IMPORTANT PALLET CHECK
----------------------
  ✓ balances (tx, query)
  ✓ assets (tx, query)
  · contracts (tx)
  ...

API CAPABILITIES
----------------
  system.dryRun:              ✓ available
  extrinsic.paymentInfo:      ✓ available (on balances.transfer)
  rpc.payment.queryInfo:      ✓ available
  rpc.chain.getFinalizedHead: ✓ available
  query.system.account:       ✓ available

SUMMARY
-------
  Endpoint:         wss://mainnet.portaldot.io
  Chain:            portaldot
  Spec name:        portaldot
  Spec version:     3000
  Genesis hash:     0xabc123...
  system.dryRun:    available
  Fee query APIs:   available

IMPORTANT
---------
  • This tool performs read-only queries only. No signing, no submission.
  • A successful connection does NOT prove Portaldot V3.0 compatibility.
  • V3.0 verification requires organizer confirmation of specName/specVersion.
  • For hackathon testnet verification, use the endpoint provided by organizers.

✓ Disconnected cleanly
```

### Missing Configuration

If `PORTALDOT_WS_URL` is not set, the script exits with an error and usage instructions:

```bash
$ npm run doctor
✗ Configuration error: PORTALDOT_WS_URL environment variable is not set

Usage:
  PORTALDOT_WS_URL=wss://your-endpoint npm run doctor

Example (mainnet):
  PORTALDOT_WS_URL=wss://mainnet.portaldot.io npm run doctor

Example (local development node):
  PORTALDOT_WS_URL=ws://127.0.0.1:9944 npm run doctor

Note: For official hackathon testnet verification, await organizer confirmation
      of the correct testnet endpoint and expected specName/specVersion.
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
  chain.js           # Connection wrapper (mainnet default)
  amount.js          # Amount conversion
test/
  intent.test.js     # Intent validation tests
  plan.test.js       # Plan builder tests
  preflight.test.js  # Preflight checks (64 tests)
  executor.test.js   # (not yet created - fee estimation coverage gap)
  pipeline.test.js   # Integration tests (22 tests)
  receipt.test.js    # Receipt builder tests
  doctor.test.js     # Network doctor config/format tests
scripts/
  demo.js            # Offline demonstration script
  doctor.js          # Network verification (read-only)
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
## Live V3 Demo (read-only)

ChainRelay can inspect accounts, estimate fees, and run preflight checks against the official Portaldot V3 testnet without signing or submitting transactions.

### Commands

`ash
# Install dependencies (if not already installed)
npm install

# Run offline tests
npm test

# Run offline demo (mocked)
npm run demo

# Run network doctor against V3
PORTALDOT_WS_URL='wss://test-node-v3.portaldot.dev' npm run doctor

# Run live read-only V3 demo
PORTALDOT_WS_URL='wss://test-node-v3.portaldot.dev' npm run demo:v3
`

### What it shows
- V3 account inspection (handles frozen/flags shape; legacy miscFrozen/feeFrozen when present)
- Unsigned call construction (balances.transferKeepAlive)
- Fee estimation via paymentInfo (estimates only)
- Preflight checks with conservative warnings

### What it does NOT prove
- Transaction executability (fee estimates and passing preflight are not guarantees)
- Successful submission/finalization (no signing or broadcasting)
- Signed-transfer outcome (unsigned system.dryRun returning BadOrigin is an unsigned simulation limitation)
- Frozen balance breakdown on V3 (semantics uncertain; handled conservatively with warnings)
- Cross-chain/bridge execution

All demo operations are read-only. No private keys, seed phrases, or testnet funds are requested.
