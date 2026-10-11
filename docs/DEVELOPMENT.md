# Development Guide

## Test Commands

```bash
# Run all tests (122 tests)
npm test

# Run specific test file
node --test test/preflight.test.js
node --test test/pipeline.test.js
node --test test/intent.test.js
node --test test/plan.test.js
node --test test/receipt.test.js

# Run tests matching pattern
node --test --test-name-pattern="preflight"

# Watch mode (reruns on file change)
node --test --watch
```

## Adding Tests

### Unit Tests (preflight.test.js, intent.test.js, etc.)
- Test pure functions in isolation
- Mock `api` with minimal query/rpc/tx structure
- Use `assert` or `node:assert/strict`
- Follow existing naming: `✔ description (time)`

### Integration Tests (pipeline.test.js)
- Test full pipeline with mocked API
- Verify stage transitions and receipt structure
- Include edge cases: BadOrigin, RPC errors, malformed accounts

### Test Patterns

```javascript
// Mock API factory
function createMockApi(overrides = {}) {
  return {
    query: { system: { account: async () => ({ data: { free: 100000000000000n, ... } }) } },
    rpc: { 
      chain: { getFinalizedHead: async () => mockBlockHash },
      payment: { queryInfo: async () => ({ partialFee: 1000n, ... }) },
      system: { dryRun: async () => ({ Ok: { Ok: "0x0" } }) },
    },
    tx: { balances: { ... } },
    ...overrides,
  };
}

// Pre-fetched accounts for TRANSFER_ALL tests
const accounts = {
  signer: { free: "100000000000000", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
  recipient: { free: "0", reserved: "0", miscFrozen: "0", feeFrozen: "0" },
};
```

## Running Demo

```bash
npm run demo
```

Runs two scenarios with mocked dependencies:
- Scenario A: Full success path → SIMULATION_PASSED
- Scenario B: BadOrigin failure → SIMULATION_FAILED

## Pipeline Extension

### Adding New Transfer Action
1. `src/plan.js`: Add case in `constructTransferCall`
2. `src/preflight.js`: Add case in `checkBalanceSufficiency` for TRANSFER_ALL logic
3. `test/plan.test.js`: Add call construction test
4. `test/preflight.test.js`: Add balance sufficiency test

### Adding Fee Estimation Method
1. `src/executor.js`: Add method in `estimateFee` fallback chain
2. Return same shape: `{ partialFee, weight, class, paysFee, method, isEstimate }`
3. `test/executor.test.js`: Create new test file for fee estimation coverage

### Adding Preflight Check
1. `src/preflight.js`: Add new check function
2. Call from `runPreflightChecks`
3. Add to `checks[]` array in result
4. `test/preflight.test.js`: Add unit tests

### Adding Receipt Field
1. `src/receipt.js`: Add field to `buildReceipt` input and output
2. Ensure JSON-serializable (no BigInt, no functions)
3. `test/receipt.test.js`: Add serialization test

## Code Conventions

- **BigInt for amounts/fees** - Use `n` suffix, serialize as strings
- **Error objects** - Always include `stage` and `errors[]`
- **Async/await** - All API calls async
- **No side effects in validation** - Pure functions where possible
- **Structured results** - `{ ok, data?, errors?, warnings? }` pattern

## Debugging

```javascript
// Enable debug logging in pipeline
const result = await runExecutionPipeline({
  intent,
  api: mockedApi,
  // Add debug: true if implemented
});

console.log(JSON.stringify(result.receipt, null, 2));
```

## Common Issues

| Issue | Solution |
|-------|----------|
| `blockHash.toHex is not a function` | Mock `getFinalizedHead` to return object with `toHex()` |
| `paysFee.toString()` crash | Fixed in 5B: use `paysFee != null` not `!== undefined` |
| BadOrigin in dry-run | Expected for unsigned extrinsics on signed-origin pallets |
| Fee estimation fails | Check `extrinsic.paymentInfo` exists, fallback to `queryInfo` |
| Preflight inconclusive | Zero-balance recipient returns inconclusive (not failure) |

## Project Constraints

- **No network access** - All tests and demo use mocked API
- **No signing/submission** - Read-only simulation only
- **No dependency changes** - Use existing @polkadot packages
- **No commits/pushes** - Local development only
- **Prefer test-only changes** - Modify `src/` only for testability

## Test Coverage Gaps

- `executor.test.js` - No fee estimation tests (coverage gap)
- `preflight.js` & `executor.js` - Duplicate fee validation (deduplication opportunity)