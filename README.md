# KudiRoll

Wallet-secured payroll using a connected Ready account's shielded USDC balance for Nigerian businesses. Businesses create reusable teams, save workers and default USDC amounts, then choose no-setup Starknet wallet payouts or fully private transfers and approve the selected payments as one atomic STRK20 action list. KudiRoll does not yet provide a separate organization-owned treasury, roles, or treasury policy controls.

KudiRoll is separated into **[KudiRail](https://github.com/Cyano88/kudirail)**, a non-custodial private-payroll API, and **KudiRoll App**, its first-party reference client. Production first-party traffic runs through KudiRail; the versioned boundary is documented in [docs/API.md](docs/API.md), while external developer credentials are not released yet.

> **Release status:** [production candidate live on Railway](https://kudiroll-production.up.railway.app). KudiRoll App is cut over to KudiRail with encrypted PostgreSQL accounts and durable authentication. Ready X is the current wallet path; email-first embedded signing remains labeled as coming soon until its Mainnet and STRK20 integration is certified. See [STRK20 integration plan](STRK20_INTEGRATION_PLAN.md), [Public launch](docs/PUBLIC_LAUNCH.md), and [Starknet integration](docs/STARKNET_INTEGRATION.md).

## Current product flow

1. Connect Ready X on Starknet Mainnet. A secure session or saved passkey can reopen an existing workspace, but Ready X remains required for private wallet actions until the email-first embedded wallet passes Mainnet certification.
2. Create separate teams for the groups the business pays.
3. Save each worker's name, Starknet address, and default USDC amount.
4. Select a team, include some or all workers, and adjust the amounts.
5. Save an immutable pay-run snapshot and review the combined total.
6. Separately simulate and shield payroll USDC in the connected wallet. The public approval and public pool deposit are shown as two explicit wallet prompts.
7. KudiRoll records only the public shield hash, checks finality from Starknet, and waits 10 blocks before enabling a newly funded payroll.
8. Choose **Pay any Starknet wallet** for public recipient withdrawals with no recipient setup, or **Fully private** for registered STRK20 recipients.
9. Simulate every selected action together, then approve the atomic action list once.
10. Review saved pay-run and settlement-provider records in History.

Only fully private recipients must first be registered with a compatible privacy wallet. Direct wallet payouts require no recipient setup, but recipient addresses and amounts are public. A submitted pay run cannot be edited.

## Account persistence

- A verified email, wallet signature or passkey creates a 12-hour HTTP-only session; only a hash of the bearer token is persisted.
- WebAuthn and wallet challenges are single-use, expire automatically, survive service restarts, and are rate limited.
- Recovery readiness requires two passkeys. Revocation requires fresh proof from a different credential and cannot reduce the account below two passkeys.
- Teams, workers, pay-run snapshots, and public shield references are isolated by wallet address.
- Local development persists data atomically in `.data/kudiroll.json`; the file is ignored by Git.
- A server restart preserves account sessions and unexpired authentication ceremonies on the mounted volume.
- Railway production uses PostgreSQL for encrypted account records, hashed sessions and single-use challenges. Schema migration 2 adds email sessions and onboarding challenges without giving email signing or recovery authority.
- Follow [the database cutover runbook](docs/DATABASE.md) for local activation and the remaining backup/restore and reverse-migration drills.

KudiRoll does not store plaintext wallet private keys, viewing keys, notes, proofs, email codes, recovery secrets, or bank details. Email codes are stored only as keyed hashes until expiry; email access cannot sign transactions, decrypt the embedded wallet, or recover funds.

STRK20 pool fees are calculated and displayed by the privacy wallet at approval time. KudiRoll does not hard-code or promise a historical fee. The app applies a disclosed 0.01 USDC product minimum and lets wallet simulation reject insufficient public USDC or fee allowance.

## Paycrest pilot

The separate Naira payout route verifies the recipient, creates one Paycrest order, previews the exact STRK20 payment, and asks Ready X for the final wallet approval. Paycrest currently creates one settlement order per recipient, so it is not presented as the atomic private team-payment path.

Live Naira settlement remains a pilot until the Starknet route passes deposit detection, payout, status tracking, and recovery certification end to end.

## Safety boundaries

- `PAYCREST_API_KEY` remains server-only and must never use a `VITE_` prefix.
- Paycrest live-order creation defaults to disabled and is amount capped.
- Expired, unsimulated, and balance-exceeding Paycrest orders cannot reach wallet approval.
- Every payroll mode requires a successful wallet simulation before the approval button appears.
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
STRK20_POOL_ADDRESS=0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
KUDIROLL_DATA_FILE=.data/kudiroll.json
KUDIROLL_AUTH_FILE=.data/kudiroll-auth.json
KUDIROLL_WEBAUTHN_ORIGIN=http://localhost:4173
KUDIROLL_WEBAUTHN_RP_ID=localhost
PHASE0_LIVE_ORDER_ENABLED=false
```

If `STARKNET_RPC_URL` is empty, Starknet.js selects its supported Starknet mainnet public provider. Use a dedicated production RPC for reliability.

`STRK20_POOL_ADDRESS` gates payroll finalization: KudiRoll marks a pay run finalized only when Starknet reports success and the receipt contains an event from that configured pool. The example value is the canonical Mainnet pool published in the sprint's Day 0 guide and used by its transaction verifier; a successful receipt without that proof remains `unknown`.

KudiRoll is currently Mainnet-only because its account challenge, private-USDC token, and STRK20 flow are Mainnet-specific. The client rejects wallets connected to another network before creating a session.

## License and security

KudiRoll is available under the [MIT License](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes and report vulnerabilities through the private process in [SECURITY.md](SECURITY.md).
