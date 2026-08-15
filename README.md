# KudiRoll

Wallet-secured private payroll for Nigerian businesses. Businesses create reusable teams, save workers and default USDC amounts, then prepare a pay run and approve the selected private transfers as one atomic STRK20 action list.

> **Release status:** public alpha preparation. WalletAccountV6 discovery, typed STRK20 operations, and the shield simulation/approval screen are implemented and tested. Public deployment remains blocked on production persistence, operational controls, and live Ready X Mainnet certification. See [STRK20 integration plan](STRK20_INTEGRATION_PLAN.md), [Public launch](docs/PUBLIC_LAUNCH.md), and [Starknet integration](docs/STARKNET_INTEGRATION.md).

## Current product flow

1. Connect a Wallet Standard Starknet wallet and sign a short-lived KudiRoll account challenge. Ready X and Xverse expose the STRK20 privacy route; other compatible wallets can still access the saved workspace.
2. Create separate teams for the groups the business pays.
3. Save each worker's name, registered Starknet address, and default private-USDC amount.
4. Select a team, include some or all workers, and adjust the amounts.
5. Save an immutable pay-run snapshot and review the combined total.
6. Separately simulate and shield treasury USDC. The public approval and public pool deposit are shown as two explicit wallet prompts.
7. Simulate every STRK20 private transfer together in the privacy wallet.
8. Type `PAY TEAM` and approve the atomic action list once.
9. Review saved pay-run and settlement-provider records in History.

Every receiving address must first be registered with the compatible privacy wallet. A submitted pay run cannot be edited.

## Account persistence

- A signed Starknet challenge creates a 12-hour HTTP-only session.
- Teams, workers, and pay-run snapshots are isolated by wallet address.
- Local development persists data atomically in `.data/kudiroll.json`; the file is ignored by Git.
- A server restart requires a fresh wallet signature but does not erase account data.
- Production should replace the local JSON adapter with a managed database and deployment secret before multi-instance use.

KudiRoll does not request or store wallet private keys, viewing keys, notes, proofs, OTPs, or bank details. Worker names and payroll amounts are business data and therefore require production-grade database encryption, backup, retention, and access controls before public use.

## Paycrest pilot

The separate Naira payout pilot verifies the recipient, creates one Paycrest order, simulates the exact STRK20 withdrawal, and only exposes wallet approval after explicit confirmations. Paycrest currently creates one settlement order per recipient, so it is not presented as the atomic private team-payment path.

Live Naira settlement remains a pilot until the Starknet route passes deposit detection, payout, status tracking, and recovery certification end to end.

## Safety boundaries

- `PAYCREST_API_KEY` remains server-only and must never use a `VITE_` prefix.
- Paycrest live-order creation defaults to disabled and is amount capped.
- Expired, unsimulated, and balance-exceeding Paycrest orders cannot reach wallet approval.
- Private payroll requires successful batch simulation and the literal confirmation `PAY TEAM`.
- Server-side signature verification protects wallet-owned account records.

## Run locally

```powershell
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:4174` when `PORT=4174` is configured in `.env.local`; otherwise the default is `http://127.0.0.1:4173`.

## Relevant configuration

```dotenv
HOST=127.0.0.1
STARKNET_RPC_URL=
KUDIROLL_DATA_FILE=.data/kudiroll.json
PHASE0_LIVE_ORDER_ENABLED=false
```

If `STARKNET_RPC_URL` is empty, Starknet.js selects its supported Starknet mainnet public provider. Use a dedicated production RPC for reliability.

KudiRoll is currently Mainnet-only because its account challenge, private-USDC token, and STRK20 flow are Mainnet-specific. The client rejects wallets connected to another network before creating a session.

## License and security

KudiRoll is available under the [MIT License](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes and report vulnerabilities through the private process in [SECURITY.md](SECURITY.md).
