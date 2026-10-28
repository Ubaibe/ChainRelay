# ChainRelay Recon

**Problem:** Before submitting a Substrate/Portaldot transfer, users need a way to validate intents, check balances and fees, and simulate execution without risking funds or broadcasting transactions.

**What it does:** ChainRelay Recon is a read-only execution pipeline for Portaldot/Substrate chains. It validates transfer intents, constructs unsigned calls, estimates fees, runs conservative preflight checks, optionally dry-runs via RPC, and produces structured JSON receipts.

## Verified Capabilities

- **Intent validation** - SS58 (prefix 42), amount format/precision (14 decimals), action validation
- **Call construction** - Builds unsigned extrinsics for `transfer`, `transferKeepAlive`, `transferAll`
- **Fee estimation** - Prefers `call.paymentInfo()`, falls back to `rpc.payment.queryInfo()`
- **Preflight checks** - Balance sufficiency, account existence (with inconclusive handling), frozen/reserved awareness; compatible with legacy (`miscFrozen`/`feeFrozen`) and V3 (`frozen`/`flags`) account layouts
- **Dry-run simulation** - Uses `rpc.system.dryRun()` when connected (read-only)
- **Structured receipts** - Execution status (`PLANNED` / `FEE_ESTIMATED` / `SIMULATION_PASSED` / `SIMULATION_FAILED`) with evidence and limitations
- **Offline operation** - Works with mocked APIs for testing and demo
- **Portaldot V3 testnet** - Verified against `wss://test-node-v3.portaldot.dev` (chain `PortaldotV3 Test`, runtime spec `portaldot-v3` 3002)

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests (160 passing)
npm test

# Run offline demo (mocked, no network)
npm run demo

# Run network doctor against the V3 testnet
PORTALDOT_WS_URL='wss://test-node-v3.portaldot.dev' npm run doctor

# Run live read-only V3 demo
PORTALDOT_WS_URL='wss://test-node-v3.portaldot.dev' npm run demo:v3
```

The live commands require network access to the endpoint. `npm test` and `npm run demo` are fully offline.

## How It Works

1. **Validate** intent schema, addresses, amount and deadline
2. **Construct** the unsigned extrinsic call for the requested action
3. **Connect** to the endpoint (live read-only) or use mocked dependencies (offline)
4. **Estimate fees** via `paymentInfo` or the `queryInfo` fallback
5. **Preflight** balances, frozen and reserved amounts (conservative when runtime semantics are uncertain)
6. **Simulate** via `rpc.system.dryRun` when connected (read-only, no state change)
7. **Emit receipt** with execution status, evidence and limitations

## Limitations

- **No signing or submission** - ChainRelay is read-only. No transaction is signed, broadcast, or executed
- **Fee estimates are not guarantees** - Actual fees may differ due to tips, weight changes, or runtime upgrades
- **Dry-run is simulation, not execution** - `rpc.system.dryRun` does not change chain state
- **`BadOrigin` is expected for unsigned calls** - Unsigned extrinsics fail dry-run on pallets that require a signed origin. This is an unsigned-simulation limitation, not evidence that a signed transfer would fail
- **Preflight is not a guarantee** - Passing preflight does not guarantee transaction execution
- **V3 frozen balances** - The frozen balance breakdown is not exposed on V3, so ChainRelay reports the uncertainty and applies conservative handling instead of guessing a mapping
- **Portaldot-focused** - Built for Portaldot/Substrate with a 14-decimal POT asset and SS58 prefix 42

ChainRelay does not perform cross-chain bridging, broadcasting, or on-chain execution.

## Web Dashboard Demo

```bash
# Install web dependencies
cd web
npm install

# Run web tests
npm test

# Type-check and build
npm run build

# Start local dev server
npm run dev
```

Open the local Vite URL, connect to `wss://test-node-v3.portaldot.dev`, inspect metadata, connect wallet via explicit click, enter recipient and amount, then run readiness check. No signing or submission occurs.


- [Architecture](docs/ARCHITECTURE.md) - Pipeline flow, component responsibilities, and safety guarantees
- [Development](docs/DEVELOPMENT.md) - Test commands and extension guide
