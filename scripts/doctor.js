#!/usr/bin/env node
/**
 * ChainRelay — Network Doctor
 *
 * Read-only network verification for Portaldot endpoints.
 * No signing, no submission, no state-changing calls.
 */

const { ApiPromise, WsProvider } = require("@polkadot/api");

function getEnvWsUrl() {
  const url = process.env.PORTALDOT_WS_URL;
  if (!url || typeof url !== "string" || url.trim() === "") {
    return null;
  }
  return url.trim();
}

function sanitizeUrlForDisplay(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return "unavailable";
  }
  if (typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
}

function formatOptional(value, label) {
  if (value === null || value === undefined) {
    return `  ${label}: unavailable`;
  }
  return `  ${label}: ${formatValue(value)}`;
}

async function runDoctor() {
  const wsUrl = getEnvWsUrl();

  if (!wsUrl) {
    console.error("✗ Configuration error: PORTALDOT_WS_URL environment variable is not set");
    console.error("");
    console.error("Usage:");
    console.error("  PORTALDOT_WS_URL=wss://your-endpoint npm run doctor");
    console.error("");
    console.error("Example (mainnet):");
    console.error("  PORTALDOT_WS_URL=wss://mainnet.portaldot.io npm run doctor");
    console.error("");
    console.error("Example (local development node):");
    console.error("  PORTALDOT_WS_URL=ws://127.0.0.1:9944 npm run doctor");
    console.error("");
    console.error("Note: For official hackathon testnet verification, await organizer confirmation");
    console.error("      of the correct testnet endpoint and expected specName/specVersion.");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                  ChainRelay Network Doctor                      ║");
  console.log("║              Read-only Portaldot endpoint verification          ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Endpoint: ${sanitizeUrlForDisplay(wsUrl)}`);
  console.log("");

  const provider = new WsProvider(wsUrl);
  let api;

  try {
    api = await ApiPromise.create({ provider });
  } catch (err) {
    console.error(`✗ Connection failed: ${err.message}`);
    console.error("");
    console.error("Possible causes:");
    console.error("  - Endpoint unreachable or incorrect");
    console.error("  - Network connectivity issues");
    console.error("  - WebSocket endpoint requires different protocol (ws:// vs wss://)");
    process.exit(1);
  }

  console.log("✓ Connected");
  console.log("");

  // Basic chain information
  let chain, nodeName, nodeVersion, genesisHash, currentBlock;
  try {
    [chain, nodeName, nodeVersion, genesisHash, currentBlock] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
      api.rpc.chain.getBlockHash(0),
      api.rpc.chain.getHeader(),
    ]);
  } catch (err) {
    console.error(`✗ Failed to query basic chain information: ${err.message}`);
    await api.disconnect();
    process.exit(1);
  }

  console.log("CHAIN INFORMATION");
  console.log("-----------------");
  console.log(`  Chain:          ${formatValue(chain)}`);
  console.log(`  Node:           ${formatValue(nodeName)}`);
  console.log(`  Node version:   ${formatValue(nodeVersion)}`);
  console.log(`  Genesis hash:   ${formatValue(genesisHash)}`);
  console.log(`  Current block:  #${formatValue(currentBlock.number)}`);
  console.log("");

  // Runtime information
  let specName, specVersion, implVersion, authoringVersion, transactionVersion;
  try {
    specName = api.runtimeVersion.specName;
    specVersion = api.runtimeVersion.specVersion;
    implVersion = api.runtimeVersion.implVersion;
    authoringVersion = api.runtimeVersion.authoringVersion;
    transactionVersion = api.runtimeVersion.transactionVersion;
  } catch (err) {
    console.warn(`⚠ Failed to query runtime version: ${err.message}`);
  }

  console.log("RUNTIME");
  console.log("-------");
  console.log(formatOptional(specName, "Spec name"));
  console.log(formatOptional(specVersion, "Spec version"));
  console.log(formatOptional(implVersion, "Impl version"));
  console.log(formatOptional(authoringVersion, "Authoring version"));
  console.log(formatOptional(transactionVersion, "Transaction version"));
  console.log("");

  // Chain properties
  let properties;
  try {
    properties = await api.rpc.system.properties();
  } catch (err) {
    console.warn(`⚠ Failed to query chain properties: ${err.message}`);
  }

  console.log("CHAIN PROPERTIES");
  console.log("----------------");
  if (properties) {
    const ss58Format = properties.ss58Format?.isSome ? properties.ss58Format.unwrap() : null;
    const tokenSymbol = properties.tokenSymbol?.isSome ? properties.tokenSymbol.unwrap() : null;
    const tokenDecimals = properties.tokenDecimals?.isSome ? properties.tokenDecimals.unwrap() : null;

    console.log(formatOptional(ss58Format, "SS58 prefix"));
    console.log(formatOptional(tokenSymbol, "Token symbol"));
    console.log(formatOptional(tokenDecimals, "Token decimals"));
  } else {
    console.log("  SS58 prefix:    unavailable");
    console.log("  Token symbol:   unavailable");
    console.log("  Token decimals: unavailable");
  }
  console.log("");

  // Available pallets
  const txPallets = Object.keys(api.tx);
  const queryPallets = Object.keys(api.query);

  console.log("AVAILABLE PALLETS");
  console.log("-----------------");
  console.log(`  Extrinsic pallets (api.tx):    ${txPallets.length}`);
  console.log(`  Storage pallets (api.query):   ${queryPallets.length}`);
  console.log("");

  // Important pallet checks
  const importantPallets = [
    "balances",
    "assets",
    "contracts",
    "utility",
    "sudo",
    "system",
    "timestamp",
    "transactionPayment",
    "xcmPallet",
    "polkadotXcm",
    "xcm",
    "bridge",
    "crossChain",
    "ibrc",
    "daas",
  ];

  console.log("IMPORTANT PALLET CHECK");
  console.log("----------------------");
  for (const pallet of importantPallets) {
    const inTx = txPallets.includes(pallet);
    const inQuery = queryPallets.includes(pallet);
    const status = inTx || inQuery ? "✓" : "·";
    const detail = [];
    if (inTx) detail.push("tx");
    if (inQuery) detail.push("query");
    console.log(`  ${status} ${pallet} ${detail.length ? `(${detail.join(", ")})` : ""}`);
  }
  console.log("");

  // API capability checks
  console.log("API CAPABILITIES");
  console.log("----------------");

  // Check system.dryRun
  const hasDryRun = typeof api.rpc?.system?.dryRun === "function";
  console.log(`  system.dryRun:              ${hasDryRun ? "✓ available" : "· unavailable"}`);

  // Check transaction fee-query APIs
  const hasPaymentInfo = typeof api.tx?.balances?.transfer?.paymentInfo === "function";
  console.log(`  extrinsic.paymentInfo:      ${hasPaymentInfo ? "✓ available (on balances.transfer)" : "· unavailable"}`);

  const hasQueryInfo = typeof api.rpc?.payment?.queryInfo === "function";
  console.log(`  rpc.payment.queryInfo:      ${hasQueryInfo ? "✓ available" : "· unavailable"}`);

  const hasGetFinalizedHead = typeof api.rpc?.chain?.getFinalizedHead === "function";
  console.log(`  rpc.chain.getFinalizedHead: ${hasGetFinalizedHead ? "✓ available" : "· unavailable"}`);

  const hasSystemAccount = typeof api.query?.system?.account === "function";
  console.log(`  query.system.account:       ${hasSystemAccount ? "✓ available" : "· unavailable"}`);

  console.log("");

  // Summary
  console.log("SUMMARY");
  console.log("-------");
  console.log(`  Endpoint:         ${sanitizeUrlForDisplay(wsUrl)}`);
  console.log(`  Chain:            ${formatValue(chain)}`);
  console.log(`  Spec name:        ${formatValue(specName)}`);
  console.log(`  Spec version:     ${formatValue(specVersion)}`);
  console.log(`  Genesis hash:     ${formatValue(genesisHash)}`);
  console.log(`  system.dryRun:    ${hasDryRun ? "available" : "unavailable"}`);
  console.log(`  Fee query APIs:   ${hasPaymentInfo || hasQueryInfo ? "available" : "unavailable"}`);
  console.log("");

  // Important disclaimer
  console.log("IMPORTANT");
  console.log("---------");
  console.log("  • This tool performs read-only queries only. No signing, no submission.");
  console.log("  • A successful connection does NOT prove Portaldot V3.0 compatibility.");
  console.log("  • V3.0 verification requires organizer confirmation of specName/specVersion.");
  console.log("  • For hackathon testnet verification, use the endpoint provided by organizers.");
  console.log("");

  await api.disconnect();
  console.log("✓ Disconnected cleanly");
}

runDoctor().catch((err) => {
  console.error("");
  console.error("✗ Doctor check failed");
  console.error("");
  console.error(err);
  process.exit(1);
});