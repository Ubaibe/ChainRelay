# Architecture

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    runExecutionPipeline                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. VALIDATION (intent.js:createIntent)                          │
│    - SS58 address validation (prefix 42)                        │
│    - Amount: 1-14 decimals, positive, no scientific notation   │
│    - Deadline: future timestamp                                 │
│    - Action: transfer | transferKeepAlive | transferAll        │
│    Output: { status: VALIDATED/REJECTED, intent?, errors? }    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. PLANNING (plan.js:buildExecutionPlan)                        │
│    - Constructs extrinsic based on action                       │
│    - transfer: balances.transfer(dest, value)                  │
│    - transferKeepAlive: balances.transferKeepAlive(dest, value)│
│    - transferAll: balances.transferAll(dest, keepAlive)        │
│    - Selects fee estimation method                              │
│    Output: { steps[], feeEstimationMethod, ... }               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PREFLIGHT (preflight.js:runPreflightChecks)                  │
│    - checkAccountExists(recipient) → exists | inconclusive     │
│    - checkBalanceSufficiency(sender, amount, fee)              │
│      * spendability: SUFFICIENT | INSUFFICIENT | INCONCLUSIVE  │
│      * accounts for: free, reserved, miscFrozen, feeFrozen     │
│      * TRANSFER_ALL: only validates fee affordability          │
│    - Validates pre-fetched account snapshots if provided       │
│      * validateAccountSnapshot() - strict field validation     │
│    Output: { ok, checks[], warnings[], spendability }          │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              ok: true                 ok: false
                    │                       │
                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. FEE ESTIMATION (executor.js:estimateFee)                     │
│    Preferred: extrinsic.paymentInfo()                           │
│    Fallback: rpc.payment.queryInfo(call, finalizedHead)        │
│    Returns: { partialFee, weight, class, paysFee, method }     │
│    paysFee: null (default) | "Signer" | "Tip" | "All"          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. DRY-RUN SIMULATION (executor.js:simulateExecution)           │
│    rpc.system.dryRun(extrinsic) → { Ok: { Ok } | { Err } | Err }│
│    - Ok: { Ok }        → dispatchOk: true                      │
│    - Ok: { Err }       → dispatchOk: false, dispatchError      │
│    - Err               → rpcOk: false, rpcError                │
│    Output: { rpcOk, dispatchOk, dispatchError, blockHash }     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. RECEIPT BUILDING (receipt.js:buildReceipt)                   │
│    Serializes all evidence into structured receipt             │
│    Status mapping:                                              │
│      - No fee, no dry-run           → PLANNED                  │
│      - Fee estimated, no dry-run    → FEE_ESTIMATED            │
│      - Dry-run: rpcOk && dispatchOk → SIMULATION_PASSED        │
│      - Dry-run: !rpcOk || !dispatchOk → SIMULATION_FAILED      │
│    Includes: preflight checks, warnings, limitations           │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### intent.js
- `createIntent(input)` - Validates and creates intent object
- `isValidSS58(address)` - SS58 prefix 42 validation
- `validateAmount(amountStr)` - 14-decimal precision, no sci notation

### plan.js
- `buildExecutionPlan(intent, api)` - Builds 9-step execution plan
- `validatePlan(plan)` - Validates plan structure
- `constructTransferCall(action, recipient, amount)` - Builds extrinsic

### preflight.js
- `checkAccountExists(api, address)` - Queries system.account
- `checkBalanceSufficiency(api, sender, amount, fee, action)` - Spendability logic
- `validateAccountSnapshot(account, label)` - Validates pre-fetched account data
- `runPreflightChecks(params)` - Orchestrates all preflight checks

### executor.js
- `estimateFee(api, call, signerAddress)` - Fee estimation (paymentInfo → queryInfo)
- `simulateExecution(api, call)` - Dry-run via rpc.system.dryRun
- `executePipelineSteps(api, plan, intent)` - Executes steps 4-5

### pipeline.js
- `runExecutionPipeline({ intent, api, accounts?, dryRun? })` - Main entry point
- Connects/disconnects API
- Orchestrates all stages
- Handles errors with stage attribution

### receipt.js
- `buildReceipt({ intent, plan, feeEstimate, simulation, preflight, status })` - Builds receipt
- `determineExecutionStatus(feeEstimate, simulation)` - Maps to status enum
- JSON-serializable output

## Data Flow

```
Input: { action, asset, amount, recipient, signer, deadline? }
         │
         ▼
Intent: { id, action, asset, amount (base units), recipient, signer, deadline, status }
         │
         ▼
Plan:   { steps[9], feeEstimationMethod, call, ... }
         │
         ▼
Preflight: { ok, checks[], warnings[], spendability, recipientExists }
         │
         ▼
FeeEstimate: { partialFee, weight, class, paysFee, method, isEstimate }
         │
         ▼
Simulation: { rpcOk, dispatchOk, dispatchError, blockHash }
         │
         ▼
Receipt: { version, executionStatus, intent, call, feeEstimate, simulation, preflight, limitations }
```

## Error Handling

Each stage produces structured errors with:
- `stage`: Where failure occurred
- `errors[]`: Human-readable messages
- `receipt`: Partial receipt with evidence up to failure point

Stages: VALIDATION, CALL_CONSTRUCTION, FEE_ESTIMATION, PREFLIGHT, SIMULATION, RECEIPT

## Key Invariants

1. **No live extrinsics in receipts** - `liveExtrinsic` stripped before serialization
2. **BigInt as strings** - All amounts/fees serialized as strings
3. **Preflight before simulation** - Simulation only runs if preflight passes
4. **API lifecycle** - Caller-provided API not disconnected; internally created API always disconnected
5. **Deterministic IDs** - Intent IDs from SHA256 of canonical fields

## Extension Points

- Add new actions: extend `constructTransferCall` and `checkBalanceSufficiency`
- New fee methods: add to `estimateFee` fallback chain
- Custom preflight checks: extend `runPreflightChecks`
- New receipt fields: extend `buildReceipt` input object