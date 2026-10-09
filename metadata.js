const { ApiPromise, WsProvider } = require("@polkadot/api");

const WS_URL = "wss://mainnet.portaldot.io";

async function main() {
    console.log("=================================");
    console.log("CHAINRELAY — METADATA RECON");
    console.log("=================================");
    console.log(`Connecting to: ${WS_URL}`);
    console.log("");

    const provider = new WsProvider(WS_URL);

    const api = await ApiPromise.create({
        provider,
    });

    console.log("✓ Connected");
    console.log("");

    console.log("RUNTIME");
    console.log("-------");
    console.log(`Spec: ${api.runtimeVersion.specName}`);
    console.log(`Version: ${api.runtimeVersion.specVersion}`);
    console.log("");

    // --------------------------------------------------
    // Runtime modules
    // --------------------------------------------------

    console.log("PALLETS");
    console.log("-------");

    const pallets = Object.keys(api.tx);

    for (const pallet of pallets) {
        console.log(`- ${pallet}`);
    }

    console.log("");

    // --------------------------------------------------
    // Calls for every pallet
    // --------------------------------------------------

    console.log("PALLET CALLS");
    console.log("------------");

    for (const pallet of pallets) {
        try {
            const calls = Object.keys(api.tx[pallet]);

            console.log("");
            console.log(`[${pallet}]`);

            for (const call of calls) {
                console.log(`  ${call}`);
            }
        } catch (error) {
            console.log(`  Unable to inspect ${pallet}`);
        }
    }

    console.log("");

    // --------------------------------------------------
    // Storage modules
    // --------------------------------------------------

    console.log("PALLET STORAGE");
    console.log("--------------");

    const queryPallets = Object.keys(api.query);

    for (const pallet of queryPallets) {
        try {
            const storage = Object.keys(api.query[pallet]);

            console.log("");
            console.log(`[${pallet}]`);

            for (const item of storage) {
                console.log(`  ${item}`);
            }
        } catch (error) {
            console.log(`  Unable to inspect ${pallet}`);
        }
    }

    console.log("");

    // --------------------------------------------------
    // Constants
    // --------------------------------------------------

    console.log("PALLET CONSTANTS");
    console.log("----------------");

    const constPallets = Object.keys(api.consts);

    for (const pallet of constPallets) {
        try {
            const constants = Object.keys(api.consts[pallet]);

            if (constants.length === 0) {
                continue;
            }

            console.log("");
            console.log(`[${pallet}]`);

            for (const constant of constants) {
                console.log(`  ${constant}`);
            }
        } catch (error) {
            console.log(`  Unable to inspect ${pallet}`);
        }
    }

    console.log("");

    console.log("=================================");
    console.log("METADATA RECON COMPLETE");
    console.log("=================================");

    await api.disconnect();
}

main().catch((error) => {
    console.error("");
    console.error("✗ Metadata reconnaissance failed");
    console.error("");
    console.error(error);
    process.exit(1);
});