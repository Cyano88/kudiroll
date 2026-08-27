# Public launch

KudiRoll is a public alpha backed by the standalone KudiRail service and managed PostgreSQL. This checklist separates verified production infrastructure from the wallet, email-delivery, resilience, and settlement evidence still required before a general-availability claim.

## Recovered baseline

- React, Vite, and TypeScript frontend with an Express backend.
- Wallet-signed accounts, reusable teams and workers, immutable pay-run snapshots, and history.
- STRK20 batch simulation, literal `PAY TEAM` confirmation, one wallet submission, and transaction-hash persistence.
- Responsive light and dark interfaces, including mobile navigation.
- Paycrest is isolated as a guided settlement pilot and live order creation is disabled by default.
- Local typecheck, tests, and production build pass.

## Release gates

| Gate | State | Required evidence |
| --- | --- | --- |
| Reproducible source and CI | Complete | Public repositories, reviewed history, green CI, clean builds, and generated artifacts excluded. |
| License and contribution policy | Complete | MIT license, contribution guide, and private security-reporting process are published. |
| Email-first access | Activation pending | Add `RESEND_API_KEY` and `KUDIROLL_EMAIL_FROM` to KudiRail, redeploy, then prove request, OTP verification, returning sign-in, first-time wallet linking, and passkey upgrade. |
| Live private payroll | Manual gate | Submit one smallest-safe Mainnet batch to at least two Ready-registered recipients and verify the STRK20 pool event and final application status. |
| Production data | Operational drill pending | Encrypted PostgreSQL schema 2 is live; complete managed backup/restore, reverse migration, retention, deletion, and encryption-key rotation drills. |
| Production sessions | Recovery drill pending | Durable hashed sessions, single-use challenges, revocation, and per-process rate limits are live; certify two-device passkey recovery and keep one KudiRail replica until distributed rate limiting is added. |
| Hosting | Complete for public alpha | Both Railway services are HTTPS, health-gated, release-addressable, rollback-safe, and currently report healthy KudiRail/PostgreSQL dependencies. |
| Security and privacy | Review pending | Security headers, origin policy, dependency audit, privacy/terms copy, and custody boundaries are implemented; complete an external threat review and incident-response drill. |
| Paycrest settlement | Pilot | Deposit detection, payout completion, expiry, refund, failure, reconciliation, and recovery certification remain required before enabling new live orders. |
| Starknet ecosystem package | In progress | Public URL, source, architecture, and compatibility documentation exist; add the sanitized demo and verified Mainnet transaction references. |

Implemented security baseline: sensitive Paycrest routes require a wallet-signed session, provider history is isolated by refund wallet, provider order refunds are bound to the authenticated wallet, and pay runs cannot skip preparation before submission. Authentication and recovery endpoints are rate limited, sessions and single-use challenges are durable and hashed, and pay-run finalization requires an event from the configured STRK20 pool; remaining drills are named in the table above.

## Safe release sequence

### 1. Establish the public codebase

- Review the untracked source and create the first commit only when the owner approves.
- Select a license; do not publish as open source without an explicit choice.
- Connect the repository to CI and protect the main branch.

### 2. Certify the money path

- Use the smallest safe Mainnet amounts.
- Use at least two receiving wallets already registered for Ready private transfers.
- Capture only technical evidence: versions, count, simulation result, transaction hash, and final status.
- Never place worker names, wallet secrets, viewing keys, proofs, OTPs, or bank details in issues or public logs.

### 3. Replace local-only infrastructure

- Replace `.data/kudiroll.json` and in-memory sessions before multi-instance deployment.
- Add schema migrations, encryption, backups, retention, account deletion, rate limiting, telemetry, alerting, and rollback.
- Configure `NODE_ENV=production`, `HOST=0.0.0.0`, a deployment-assigned `PORT`, a dedicated `STARKNET_RPC_URL`, and server-only secrets.
- For Railway CLI deployments, set `KUDIROLL_RELEASE_SHA` to the exact reviewed commit. The health endpoint prefers it because `RAILWAY_GIT_COMMIT_SHA` can remain on earlier Git-source metadata during a CLI upload.

### 4. Limited alpha

- Start with invited businesses and capped transaction sizes.
- Keep Paycrest live-order creation off until its complete Starknet settlement lifecycle is certified.
- Track support and reconciliation outcomes before widening access.

### 5. Ecosystem release

- Publish the integration and security documentation.
- Produce a short wallet-to-pay-run demo with sanitized recipients.
- Approach Starknet wallet, infrastructure, community, and ecosystem-listing channels with verified claims only.

## Live certification record

Use this sanitized template after the run:

```text
Date/time (UTC):
Environment: Starknet Mainnet
Wallet and version:
STRK20 API versions reported:
Recipient count:
Token contract:
Simulation result:
Submission transaction hash:
Final transaction status:
Application pay-run status:
Recovery/retry needed:
```
