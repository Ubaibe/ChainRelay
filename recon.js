const { ApiPromise, WsProvider } = require("@polkadot/api");

const WS_URL = "wss://mainnet.portaldot.io";

async function main() {
    console.log("=================================");
    console.log("CHAINRELAY — PORTALDOT RECON");
    console.log("=================================");
    console.log(`Connecting to: ${WS_URL}`);
    console.log("");

    const provider = new WsProvider(WS_URL);

    const api = await ApiPromise.create({
        provider,
    });

    console.log("✓ Connected to Portaldot");
    console.log("");

    // --------------------------------------------------
    // Basic chain information
    // --------------------------------------------------

    const [chain, nodeName, nodeVersion] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version(),
    ]);

    const header = await api.rpc.chain.getHeader();

    console.log("CHAIN INFORMATION");
    console.log("-----------------");

    console.log(`Chain:          ${chain.toString()}`);
    console.log(`Node:           ${nodeName.toString()}`);
    console.log(`Node version:   ${nodeVersion.toString()}`);
    console.log(`Latest block:   #${header.number.toString()}`);

    console.log("");

    // --------------------------------------------------
    // Runtime
    // --------------------------------------------------

    console.log("RUNTIME");
    console.log("-------");

    console.log(
        `Spec name:      ${api.runtimeVersion.specName.toString()}`
    );

    console.log(
        `Spec version:   ${api.runtimeVersion.specVersion.toString()}`
    );

    console.log(
        `Impl version:   ${api.runtimeVersion.implVersion.toString()}`
    );

    console.log("");

    // --------------------------------------------------
    // Chain properties
    // --------------------------------------------------

    console.log("CHAIN PROPERTIES");
    console.log("----------------");

    const properties = await api.rpc.system.properties();

    console.log(
        `SS58 prefix:    ${
      properties.ss58Format.isSome
        ? properties.ss58Format.unwrap().toString()
        : "unknown"
    }`
    );

    console.log(
        `Token symbol:   ${
      properties.tokenSymbol.isSome
        ? properties.tokenSymbol.unwrap().toString()
        : "unknown"
    }`
    );

    console.log(
        `Token decimals: ${
      properties.tokenDecimals.isSome
        ? properties.tokenDecimals.unwrap().toString()
        : "unknown"
    }`
    );

    console.log("");

    // --------------------------------------------------
    // Pallets
    // --------------------------------------------------

    console.log("AVAILABLE PALLETS");
    console.log("-----------------");

    const pallets = Object.keys(api.tx);

    console.log(`Total pallets: ${pallets.length}`);
    console.log("");

    pallets.forEach((pallet) => {
        console.log(`  ${pallet}`);
    });

    console.log("");

    // --------------------------------------------------
    // Important pallet checks
    // --------------------------------------------------

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
        const exists = pallets.includes(pallet);

        console.log(
            `${exists ? "✓" : "·"} ${pallet}`
        );
    }

    console.log("");

    // --------------------------------------------------
    // Contract-related queries
    // --------------------------------------------------

    console.log("CONTRACT SUPPORT");
    console.log("----------------");

    console.log(
        `contracts pallet: ${
      pallets.includes("contracts") ? "AVAILABLE" : "NOT FOUND"
    }`
    );

    if (api.query.contracts) {
        console.log("contracts storage: AVAILABLE");
    } else {
        console.log("contracts storage: NOT EXPOSED");
    }

    console.log("");

    // --------------------------------------------------
    // Transaction payment
    // --------------------------------------------------

    console.log("TRANSACTION PAYMENT");
    console.log("-------------------");

    if (api.tx.transactionPayment) {
        console.log("✓ transactionPayment pallet available");
    } else {
        console.log("· transactionPayment pallet not found");
    }

    console.log("");

    // --------------------------------------------------
    // Final
    // --------------------------------------------------

    console.log("=================================");
    console.log("PORTALDOT RECON COMPLETE");
    console.log("=================================");

    await api.disconnect();
}

main().catch((error) => {
    console.error("");
    console.error("✗ Portaldot reconnaissance failed");
    console.error("");
    console.error(error);
    process.exit(1);
});