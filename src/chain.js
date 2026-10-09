/**
 * ChainRelay — Portaldot Connection Wrapper
 *
 * Small wrapper around @polkadot/api for connecting to Portaldot.
 * Read-only. No signing. No reconnection logic.
 */

const { ApiPromise, WsProvider } = require("@polkadot/api");

const WS_URL = "wss://mainnet.portaldot.io";

/**
 * Connect to Portaldot mainnet.
 *
 * @returns {Promise<ApiPromise>}
 */
async function connect() {
  const provider = new WsProvider(WS_URL);
  const api = await ApiPromise.create({ provider });
  return api;
}

/**
 * Safely disconnect an ApiPromise instance.
 *
 * @param {ApiPromise} api
 */
async function disconnect(api) {
  if (api) {
    await api.disconnect();
  }
}

module.exports = {
  connect,
  disconnect,
};