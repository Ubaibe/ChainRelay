/**
 * ChainRelay — Read-Only Account Inspection
 *
 * Inspects signer and recipient accounts on Portaldot.
 * No signing. No submission. Read-only.
 */

const { SUPPORTED_ACTIONS } = require("./intent");
const { toBaseUnits } = require("./amount");
const { isValidSS58 } = require("./intent");

/**
 * Inspect the signer and recipient accounts for a validated intent.
 *
 * @param {object} intent - intent containing signer and recipient addresses
 * @param {object} api - @polkadot/api ApiPromise instance
 * @returns {object} serializable account inspection result
 */
async function inspectAccounts(intent, api) {
  if (!intent) {
    throw new Error("Intent is required");
  }
  if (!intent.signer) {
    throw new Error("Intent signer is required");
  }
  if (!intent.recipient) {
    throw new Error("Intent recipient is required");
  }
  if (!api || typeof api.query?.system?.account !== "function") {
    throw new Error("Valid ApiPromise instance with system.account query is required");
  }

  const signerAccount = await api.query.system.account(intent.signer);
  const recipientAccount = await api.query.system.account(intent.recipient);

  function extractAccount(address, account) {
    const data = account.data;
    return {
      address,
      free: data.free.toString(),
      reserved: data.reserved.toString(),
      miscFrozen: data.miscFrozen.toString(),
      feeFrozen: data.feeFrozen.toString(),
    };
  }

  return {
    signer: extractAccount(intent.signer, signerAccount),
    recipient: extractAccount(intent.recipient, recipientAccount),
  };
}

/**
 * Construct a balances extrinsic from an already-validated intent.
 *
 * Does NOT sign or submit. Returns a serializable description plus
 * the raw extrinsic object for use by later execution steps.
 *
 * @param {object} intent - validated intent
 * @param {object} api - @polkadot/api ApiPromise instance
 * @returns {object} serializable call description with extrinsic
 */
function constructTransferCall(intent, api) {
  if (!intent) {
    throw new Error("Intent is required");
  }
  if (!api || typeof api.tx?.balances !== "object") {
    throw new Error("Valid ApiPromise instance with balances pallet is required");
  }
  if (!intent.action || !Object.values(SUPPORTED_ACTIONS).includes(intent.action)) {
    throw new Error(`Unsupported action: ${intent.action}`);
  }
  if (!intent.recipient) {
    throw new Error("Intent recipient is required");
  }

  switch (intent.action) {
    case SUPPORTED_ACTIONS.TRANSFER: {
      if (!intent.amount) {
        throw new Error("Intent amount is required for transfer");
      }
      const amountBN = toBaseUnits(intent.amount, 14);
      const call = api.tx.balances.transfer(intent.recipient, amountBN);
      return {
        action: intent.action,
        pallet: "balances",
        method: "transfer",
        recipient: intent.recipient,
        amount: amountBN.toString(),
        keepAlive: null,
        call,
      };
    }

    case SUPPORTED_ACTIONS.TRANSFER_KEEP_ALIVE: {
      if (!intent.amount) {
        throw new Error("Intent amount is required for transferKeepAlive");
      }
      const amountBN = toBaseUnits(intent.amount, 14);
      const call = api.tx.balances.transferKeepAlive(intent.recipient, amountBN);
      return {
        action: intent.action,
        pallet: "balances",
        method: "transferKeepAlive",
        recipient: intent.recipient,
        amount: amountBN.toString(),
        keepAlive: null,
        call,
      };
    }

    case SUPPORTED_ACTIONS.TRANSFER_ALL: {
      // Runtime metadata confirms exactly 2 args: (dest, keepAlive)
      const keepAlive = false;
      const call = api.tx.balances.transferAll(intent.recipient, keepAlive);
      return {
        action: intent.action,
        pallet: "balances",
        method: "transferAll",
        recipient: intent.recipient,
        amount: null,
        keepAlive,
        call,
      };
    }

    default:
      throw new Error(`Unsupported action: ${intent.action}`);
  }
}

/**
 * Estimate the fee for a constructed extrinsic.
 *
 * Does NOT sign or submit. Uses the runtime's paymentInfo RPC.
 * Returns a JSON-serializable object. All monetary values are strings.
 *
 * @param {object} call - constructed Polkadot extrinsic (SubmittableExtrinsic)
 * @param {string} signerAddress - valid SS58 address
 * @param {object} api - @polkadot/api ApiPromise instance
 * @returns {object} serializable fee estimate
 */
async function estimateCallFee(call, signerAddress, api) {
  if (!call) {
    throw new Error("Call (extrinsic) is required");
  }
  if (!signerAddress || typeof signerAddress !== "string") {
    throw new Error("Signer address is required");
  }
  if (!isValidSS58(signerAddress)) {
    throw new Error(`Invalid SS58 signer address: ${signerAddress}`);
  }
  if (!api || typeof api.rpc?.chain?.getFinalizedHead !== "function") {
    throw new Error("Valid ApiPromise instance with chain.getFinalizedHead is required");
  }

  // Prefer paymentInfo on the extrinsic object if supported
  if (typeof call.paymentInfo === "function") {
    try {
      const info = await call.paymentInfo(signerAddress);
      return {
        signerAddress,
        partialFee: info.partialFee.toString(),
        weight: info.weight.toString(),
        class: info.class ? info.class.toString() : null,
        paysFee: info.paysFee != null ? info.paysFee.toString() : null,
        isEstimate: true,
        method: "paymentInfo",
      };
    } catch (err) {
      throw new Error(`Fee estimation failed (paymentInfo): ${err.message}`);
    }
  }

  // Fallback: rpc.payment.queryInfo with finalized head
  if (api.rpc?.payment?.queryInfo) {
    try {
      const blockHash = await api.rpc.chain.getFinalizedHead();
      const info = await api.rpc.payment.queryInfo(call.toHex(), blockHash);
      return {
        signerAddress,
        partialFee: info.partialFee.toString(),
        weight: info.weight.toString(),
        class: info.class ? info.class.toString() : null,
        paysFee: info.paysFee != null ? info.paysFee.toString() : null,
        isEstimate: true,
        method: "rpc.payment.queryInfo",
      };
    } catch (err) {
      throw new Error(`Fee estimation failed (queryInfo): ${err.message}`);
    }
  }

  throw new Error("Fee estimation unavailable: no supported fee-query method on this runtime");
}

/**
 * Dry-run a constructed extrinsic against the runtime.
 *
 * Does NOT sign or submit. Uses api.rpc.system.dryRun with a finalized
 * block hash. Distinguishes RPC success from simulated dispatch result.
 *
 * @param {object} call - constructed Polkadot extrinsic (SubmittableExtrinsic)
 * @param {string} signerAddress - valid SS58 address
 * @param {object} api - @polkadot/api ApiPromise instance
 * @returns {object} serializable dry-run result
 */
async function dryRunCall(call, signerAddress, api) {
  if (!call) {
    throw new Error("Call (extrinsic) is required");
  }
  if (!signerAddress || typeof signerAddress !== "string") {
    throw new Error("Signer address is required");
  }
  if (!isValidSS58(signerAddress)) {
    throw new Error(`Invalid SS58 signer address: ${signerAddress}`);
  }
  if (!api || typeof api.rpc?.system?.dryRun !== "function") {
    throw new Error("Dry-run unavailable: api.rpc.system.dryRun is not supported on this runtime");
  }
  if (typeof api.rpc?.chain?.getFinalizedHead !== "function") {
    throw new Error("Dry-run unavailable: api.rpc.chain.getFinalizedHead is required");
  }

  const blockHash = await api.rpc.chain.getFinalizedHead();
  const result = await api.rpc.system.dryRun(call.toHex(), blockHash);

  const human = result.toHuman ? result.toHuman() : result;

  // RPC-level error (different from dispatch error inside Ok/Err)
  if (human.Err && typeof human.Err === "string") {
    return {
      signerAddress,
      blockHash: blockHash.toHex(),
      rpcOk: false,
      dispatchOk: false,
      error: human.Err,
      isEstimate: true,
      method: "rpc.system.dryRun",
    };
  }

  const inner = human.Ok;

  if (inner && typeof inner === "object") {
    if (inner.Err) {
      return {
        signerAddress,
        blockHash: blockHash.toHex(),
        rpcOk: true,
        dispatchOk: false,
        dispatchError: typeof inner.Err === "string" ? inner.Err : JSON.stringify(inner.Err),
        isEstimate: true,
        method: "rpc.system.dryRun",
      };
    }
    if (inner.Ok !== undefined) {
      return {
        signerAddress,
        blockHash: blockHash.toHex(),
        rpcOk: true,
        dispatchOk: true,
        dispatchResult: inner.Ok,
        isEstimate: true,
        method: "rpc.system.dryRun",
      };
    }
  }

  return {
    signerAddress,
    blockHash: blockHash.toHex(),
    rpcOk: true,
    dispatchOk: false,
    raw: human,
    isEstimate: true,
    method: "rpc.system.dryRun",
  };
}

module.exports = {
  inspectAccounts,
  constructTransferCall,
  estimateCallFee,
  dryRunCall,
};