# ChainRelay Recon — web dashboard

A static, read-only diagnostics dashboard for the **Portaldot V3** testnet.

ChainRelay inspects a Substrate/Portaldot chain *before* you transact. It reads
live network state, validates a transfer intent locally, reads account
balances, estimates the fee for an unsigned call, runs conservative preflight
checks and reports every assumption it could not verify.

> **This milestone does not sign, broadcast or submit transactions.**
> The dashboard never asks for a seed phrase or private key, never signs, and
> never submits anything to a node. The prominent notice
> *"Read-only diagnostic: ChainRelay has not signed or submitted this
> transaction."* is always shown.

---

## Prerequisites

- **Node.js 18+** (developed and verified on Node 24) and npm.
- A network that can reach the node endpoint. The public testnet node is
  `wss://test-node-v3.portaldot.dev`.
- No API keys or backend are required.
- **Wallet connection is optional.** The dashboard is fully functional in
  read-only mode without a wallet. A Polkadot.js-compatible browser extension
  (Polkadot.js, Talisman, SubWallet or the Portaldot Extension) is only
  needed if you want to use the experimental connection prototype.

The dashboard is a pure client-side application. It talks to the node directly
over a WebSocket from the browser.

## Installation

```bash
cd web
npm install
```

The only dependency on the repository root is the shared ChainRelay core in
`../src` (`amount.js`, `intent.js`, `executor.js`, `preflight.js`,
`receipt.js`). Those modules are plain CommonJS with no Node built-ins, so the
browser can run the exact same validation, account normalization, fee
estimation and preflight logic as the `chainrelay` CLI. They are pulled in
through `web/src/lib/core.ts`, the single place that touches them.

## Local development

```bash
npm run dev
```

Vite serves the app on <http://localhost:5173> and reloads on change.

### Wallet connection (experimental)

The dashboard includes a read-only wallet connection prototype in the left
panel. It is entirely optional — the dashboard works without it.

- Click “Connect wallet” only when you want to authorize ChainRelay through
  your browser extension. Access is never requested automatically on page
  load.
- The prototype uses `@polkadot/extension-dapp` (`web3Enable`,
  `web3Accounts`) to enumerate accounts from an injected Polkadot.js-compatible
  extension. It never calls `signPayload`, `signRaw`, or `signAndSend`.
- Connection state is held in React memory only — never written to
  localStorage, sessionStorage, or cookies.
- A “Disconnect” control clears the application’s local wallet state. It does
  not revoke extension permissions.

> This is an experimental compatibility probe. The Portaldot team has not yet
> confirmed full compatibility with the standard Polkadot.js injected
> extension interface. No transaction signing or submission is performed.

## Type checking, tests and production build

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run build       # tsc --noEmit && vite build
npm run preview     # serve the production build locally
```

The test suite is deliberately small and focused on the dashboard's own
logic — exact amount conversion, invalid input handling, formatting of large
balances, network comparison and how readiness results are interpreted. It does
**not** duplicate the root CLI test suite; run that separately from the
repository root with `npm test`.

## Static deployment

`npm run build` emits a self-contained bundle in `web/dist/`:

```
dist/index.html
dist/assets/index-*.js
dist/assets/index-*.css
```

Deploy that directory to any static host (Vercel, Netlify, GitHub Pages,
Cloudflare Pages, S3, nginx). The app needs no server, no API routes and no
environment variables at runtime.

Because the app is served over HTTPS in production and the node is reached over
`wss://`, there is no mixed-content problem. The node accepts browser-origin
WebSocket connections; this was verified for `http://localhost:5173`,
`https://chainrelay.vercel.app` and for connections with no `Origin` header.

### Configuration

The endpoint is baked in at build time. Override it with:

```bash
VITE_PORTALDOT_WS_URL=wss://test-node-v3.portaldot.dev npm run build
```

See `.env.example`. If the variable is not set, the dashboard uses
`wss://test-node-v3.portaldot.dev` (the default in `web/src/lib/chain.ts`).

## Required network configuration

The dashboard compares the live node against the expected Portaldot V3
testnet identifiers. These are *expectations used for comparison only* — every
value displayed in the network panel comes from a live RPC query.

| Property | Expected value |
| --- | --- |
| Chain name | `PortaldotV3 Test` |
| Spec name | `portaldot-v3` |
| Spec version | `3002` |
| Token symbol | `tPOT` |
| Token decimals | `14` |
| SS58 prefix | `42` |
| EVM chain id | `420420777` |

A mismatch is reported as a warning in the network panel; it is never
silently rewritten.

## Known RPC limitations

These are real properties of the current runtime and the Polkadot API, and the
dashboard reports them rather than hiding them:

- **Unsigned dry-run returns `BadOrigin`.** `system.dryRun` simulates a call
  without a signature, so the runtime rejects the origin. The dashboard shows
  this as a `WARNING` and states explicitly that it is *not* evidence that a
  properly signed transfer would fail.
- **The V3 account shape exposes `frozen` and `flags`, not `miscFrozen` and
  `feeFrozen`.** The split between misc-frozen and fee-frozen is therefore
  unknown. The dashboard subtracts the single `frozen` value as a conservative
  fallback and raises a warning describing the assumption.
- **Fee estimation uses `call.paymentInfo(signerAddress)`.** The runtime
  reports an estimate, not the amount that will finally be charged (tips,
  weight changes and block conditions are not included).
- **Recipient existence is inconclusive for empty accounts.**
  `system.account` returns a default zero `AccountInfo` for accounts that do
  not exist, which cannot be distinguished from a real zero-balance account.
- **A zero-balance or unreachable node is reported as an error.** The dashboard
  never falls back to placeholder or mock data. Connection timeouts and RPC
  errors are surfaced with the actual reason.

## What the dashboard checks

Each row is a real check with one of four statuses: `PASS`, `WARNING`, `ERROR`
or `NOT CHECKED`. A check is never marked as passed merely because the
preceding step succeeded.

| Check | What it does |
| --- | --- |
| Input validation | Local, offline validation of both SS58 addresses and the amount. No RPC involved. |
| Account balance | Reads `system.account` for sender and recipient. |
| Transfer-call construction | Builds a `balances.transferKeepAlive` call for inspection. |
| Estimated fee | `call.paymentInfo(signerAddress)`. |
| Readiness assessment | Compares the available balance against amount + estimated fee. |
| Simulation (dry-run) | `system.dryRun` against the finalized head. |
| Warnings and limitations | Every assumption the checks could not verify. |
| Transaction preview | The encoded call that was estimated and simulated. |

## Monetary correctness

- Token amounts are converted with the shared root `src/amount.js`, which
  works on decimal strings and integer base units.
- No token arithmetic uses floating point.
- Balances and base-unit amounts are never passed through `Number()`. They
  are formatted with pure string manipulation, so a 14-decimal value stays
  exact at any magnitude.

## Project layout

```
web/
├── index.html
├── package.json
├── vite.config.ts        Vite + React + CommonJS handling for ../src
├── vitest.config.ts      focused Node-based tests
├── .env.example
└── src/
    ├── main.tsx          React entry point
    ├── App.tsx           application shell and state
    ├── styles.css        dark developer-dashboard theme
    ├── components/       NetworkPanel, ReadinessForm, ResultsPanel, WalletPanel, Primitives
    ├── hooks/            useNodeConnection, useWallet
    └── lib/
        ├── core.ts       the only module that imports the root ../src core
        ├── chain.ts      WebSocket connection + live network snapshot
        ├── readiness.ts  the read-only readiness workflow
        └── format.ts     exact string-based formatting
```
