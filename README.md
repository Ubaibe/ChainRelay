# ChainRelay Recon

**ChainRelay is a Portaldot V3 transaction-readiness and evidence diagnostics dashboard.**

**Know before you transact.**

ChainRelay helps users inspect network identity, transaction readiness, fee and balance evidence, simulation results, and transaction intent before any signing or submission. It is read-only and does not sign, submit, or broadcast transactions.

## Implemented Capabilities

- Transaction Readiness Passport for the supported Portaldot transfer flow.
- Explainable readiness failures and diagnostic findings.
- Substrate network identity and runtime information, including genesis hash, spec name, spec version, implementation version, transaction version, and metadata availability.
- Optional EVM endpoint identity checks when `VITE_PORTALDOT_EVM_RPC_URL` is configured.
- Explicitly inconclusive cross-interface Substrate/EVM equivalence where equivalence is not documented.
- Transaction Evidence Inspector.
- Read-only transaction intent verification for the supported `balances.transferKeepAlive` flow.
- Recipient, amount, sender, balance, fee, and simulation evidence checks for the supported transfer flow.
- Runtime association using available genesis hash and runtime identity evidence.
- Encoded call evidence capture, including call bytes and capture timestamp.
- Privacy-conscious address redaction in displayed/exported evidence.
- UI grouping/collapsing of secondary technical evidence.

Statuses used by the application include: `VERIFIED`, `FAILED`, `WARNING`, `INCONCLUSIVE`, `NOT_TESTED`, `UNAVAILABLE`, `CAPTURED`, and `UNSUPPORTED`. `CAPTURED` means encoded call evidence was captured and associated with runtime provenance; it does not mean the call was independently decoded or proven safe.

## Security Investigation Progress

Implemented work:

- S0: security feasibility and architecture reconnaissance.
- S1–S4: read-only transaction intent, recipient/amount, fee/balance, and simulation evidence hardening.
- S7: runtime association hardening.
- S9: encoded call evidence capture.

Research/reconnaissance only:

- S5: wallet signer compatibility reconnaissance.
- S6: runtime metadata enrichment reconnaissance.
- S8: metadata-backed decoding feasibility assessment; no production implementation.
- S10–S11: decoding feasibility reassessment and API-level experiment; not production decoding.
- S12: blocked because genuine Portaldot V3 runtime metadata with authoritative provenance was unavailable.

S5, S6, S8, S10, S11, and S12 are research outcomes, not shipped protection features.

## Architecture and Data Flow

ChainRelay combines a CLI/core execution pipeline with a web dashboard:

1. Network identity and runtime evidence are collected from the connected Substrate node.
2. Account, fee, preflight, and dry-run evidence are gathered through read-only RPC calls.
3. The constructed `balances.transferKeepAlive` call is represented as a Transaction Readiness Passport.
4. Diagnostics and explainable failures are derived from readiness evidence.
5. Transaction intent verification compares original intent with constructed evidence, including recipient, amount, sender, balance, fee, simulation, runtime association, and encoded call capture.
6. Evidence is presented through the Passport, diagnostics, and Transaction Evidence Inspector.

No signing, wallet permission requests, or transaction submission occur in the readiness/intent verification flow.

## Setup

```bash
# Install root dependencies
npm install

# Install web dependencies
cd web
npm install
cd ..
```

Optional environment variable:

```bash
VITE_PORTALDOT_EVM_RPC_URL=https://example-rpc-url
```

Do not invent or hardcode an official Portaldot EVM RPC endpoint. The EVM check is optional and only runs when configured.

## Development and Testing

Root CLI/core:

```bash
npm test
npm run demo
PORTALDOT_WS_URL='wss://test-node-v3.portaldot.dev' npm run doctor
PORTALDOT_WS_URL='wss://test-node-v3.portaldot.dev' npm run demo:v3
```

Web dashboard:

```bash
cd web
npm test
npm run typecheck
npm run build
npm run dev
```

`npm test` and `npm run demo` are fully offline. Live commands require network access to the endpoint.

## Known Limitations

- Independent metadata-backed call decoding is not implemented.
- S9 call-byte capture is not proof of independent decoding or transaction safety.
- S12 is blocked pending authoritative Portaldot V3 metadata and documented provenance.
- Only the supported `balances.transferKeepAlive` flow is covered by the current intent-verification implementation.
- Batch, proxy, multisig, token approval, NFT approval, and general contract-call analysis are not supported.
- No general malicious-address reputation or scam-detection engine exists.
- No signed transaction simulation or guarantee of execution success.
- No wallet signing or transaction submission is performed by the readiness/intent verification flow.
- Portaldot custom signed extensions `AuthorizeCall` and `EthSetOrigin` remain insufficiently documented/verified for wallet compatibility.
- EVM endpoint configuration is optional.
- Cross-interface Substrate/EVM equivalence remains inconclusive without authoritative documentation.

## Roadmap

Potential next steps, not currently implemented:

- Obtain genuine Portaldot V3 metadata with authoritative provenance.
- Reassess narrow transfer-only metadata-backed decoding.
- Investigate documented wallet compatibility and custom signed extensions.
- Expand transaction-call coverage only after evidence-backed validation.
- Explore security detection only after reliable decoding and simulation capabilities exist.

## References

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
