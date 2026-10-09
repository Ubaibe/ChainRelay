const { ApiPromise, WsProvider } = require("@polkadot/api");

const WS_URL = "wss://mainnet.portaldot.io";

async function main() {
    console.log("=================================");
    console.log("CHAINRELAY — EVENT RECON");
    console.log("=================================");
    console.log(`Connecting to: ${WS_URL}`);
    console.log("");

    const provider = new WsProvider(WS_URL);

    const api = await ApiPromise.create({
        provider,
    });

    console.log("✓ Connected");
    console.log("");

    console.log("CHAIN EVENTS");
    console.log("------------");

    const pallets = Object.keys(api.events);

    for (const pallet of pallets) {
        try {
            const events = Object.keys(api.events[pallet]);

            if (events.length === 0) {
                continue;
            }

            console.log("");
            console.log(`[${pallet}]`);

            for (const event of events) {
                console.log(`  ${event}`);
            }
        } catch (error) {
            console.log(`  Unable to inspect ${pallet}`);
        }
    }

    console.log("");
    console.log("=================================");
    console.log("EVENT RECON COMPLETE");
    console.log("=================================");

    await api.disconnect();
}

main().catch((error) => {
    console.error("");
    console.error("✗ Event reconnaissance failed");
    console.error("");
    console.error(error);
    process.exit(1);
});