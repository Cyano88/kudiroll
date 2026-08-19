# STRK20 Privacy Integration Plan — KudiRoll

Generated 2026-08-15 by the `strk20-privacy-integration` skill. This is the execution source of truth for the STRK20 Private Sprint; statuses and package/API assumptions must be re-verified at each phase boundary.

## 1. Project snapshot

- Stack: React 18, Vite 8, TypeScript 5.8, Express 4, Node 20+, `starknet@10.7.0`, and get-starknet Wallet Standard discovery `6.0.4`.
- Wallet connection: `src/App.tsx` discovers Wallet Standard providers, creates a typed `WalletAccountV6`, enforces Mainnet, and creates the wallet-signed KudiRoll session.
- STRK20 transaction layer: `src/phase0.ts` exposes typed shield, balance, batch private-transfer, and withdrawal functions; UI code constructs no raw `wallet_strk20*` request.
- Payroll UI: `src/App.tsx:767-800` simulates/submits an immutable multi-worker pay run; `src/App.tsx:876-877` requires the literal `PAY TEAM` confirmation.
- Settlement UI: `src/App.tsx:369-438` creates, simulates, and submits the Paycrest withdrawal pilot.
- Backend: `src/server/account-router.ts` handles wallet-signed sessions; `src/server/account-store.ts` stores business, team, and pay-run data in a local JSON file; `src/server/phase0-router.ts` and `src/server/paycrest.ts` isolate the Paycrest API behind the server.
- Tests: Node test runner in `tests/account-store.test.ts` and `tests/phase0.test.ts`; GitHub Actions in `.github/workflows/ci.yml`.
- Contracts: no Cairo/Scarb project and no app-owned Starknet account or viewing key.
- Repository state: public MIT-licensed source at `https://github.com/Cyano88/kudiroll`, green CI, and a Railway public alpha; no demo video or mainnet evidence hashes yet.
- Privacy goal: conceal the employer-to-worker relationship, individual recipients, amounts, token type, and spent notes during payroll; make shield and intentional settlement exits visibly public; preserve a controlled evidence trail for legitimate investigation without exposing unrelated workers.
- Environment: Starknet Mainnet with Ready as the first certified privacy wallet. Standard wallets may authenticate to KudiRoll but private actions degrade gracefully when STRK20 capability is absent.

## 2. Integration problem

- KudiRoll already models a useful payroll product, but it sends raw Wallet API requests instead of using the supported starknet.js `WalletAccountV6` route.
- The product now has the typed shield flow and treasury-readiness engine; manual Ready/Mainnet certification remains before it can claim a proven live shield.
- Local JSON persistence and in-memory sessions are not production infrastructure.
- Paycrest is a useful accountable exit, but its complete Starknet order, deposit, webhook, payout, refund, and reconciliation lifecycle is not certified.
- Judges currently have no public source, deployment, video, or mainnet transaction evidence to score.

## 3. Chosen route: Privacy Wallet API through starknet.js

KudiRoll is a normal dapp whose users connect their own wallets, so it will construct a starknet.js `WalletAccountV6` from get-starknet v6 discovery and ask the wallet to shield, read a consented balance, transfer privately, and unshield. Ready owns account registration, viewing keys, notes, proving, and pool interaction; KudiRoll never receives or stores any of them.

No Cairo contract, self-hosted prover, direct Privacy SDK integration, sub-account experiment, or private-swap feature is required for the sprint-winning core. Those additions would expand audit and delivery risk without improving the payroll journey enough to justify them.

## 3A. Approved route pivot — KudiRoll Embedded Wallet

**Decision 2026-08-16:** the public product will move from an extension-first dapp to a wallet/infra product using the direct Privacy SDK browser surface. Ready X remains an internal Mainnet certification and recovery harness until the embedded route independently passes registration, note discovery, balance, shield, atomic transfer, and withdrawal checks; it is not the intended customer journey.

**Delivery order 2026-08-16:** finish and certify the Ready-backed shield, atomic payroll, and intentional withdrawal evidence first, while preserving the extensionless embedded wallet as the committed product route. This prevents SDK packaging or custody work from blocking the three Mainnet transactions judges require.

Security boundary:

- Signer and viewing keys are generated and decrypted only in an isolated browser worker; KudiRoll servers never receive plaintext wallet secrets.
- The encrypted vault uses a non-exportable key derived from a WebAuthn PRF/passkey secret. The server may store ciphertext and public account metadata only.
- There is no password-only, localStorage-plaintext, analytics, logging, or support-export fallback for wallet secrets.
- Hosted proving and indexed discovery are allowed, but onchain deposit screening remains enforced and neither service receives the viewing key unless the official protocol request format explicitly requires protected client-side disclosure.
- Email identifies the KudiRoll account; a passkey authorizes wallet decryption. Recovery must preserve self-custody and is a release blocker, not a later UX task.

Execution phases:

1. **E0 — vault foundation ✅ done 2026-08-16:** versioned AES-256-GCM envelope, WebAuthn-PRF/HKDF unlock seam, non-exportable derived keys, tamper and wrong-passkey rejection, zero plaintext persistence, and four unit tests. The module is not connected to production UI or storage yet.
2. **E1 — identity and recovery — in progress:** verified email, passkey registration/authentication, encrypted cross-device backup, credential revocation, and recovery ceremony.
   - **E1a ✅ done 2026-08-16:** migration-safe discoverable passkey registration and extension-free authentication, required user verification, exact production RP/origin validation, five-minute single-use challenges, public-credential persistence, sanitized account responses, and validated ciphertext-only vault backup storage. Recovery, verified email, credential revocation, PRF unlock, and embedded-wallet creation remain blocked gates; no wallet secret is generated in this slice.
   - **E1b implemented locally 2026-08-17:** vault v2 stores only STRK20 private state, encrypts it under a random AES key, and wraps that key independently for each PRF-capable passkey. The server accepts ciphertext only when it is bound to the signed-in Starknet address and at least two active credential slots. Browser PRF certification, two-device recovery, and revocation remain manual release gates.
   - **E1c headless-complete 2026-08-18; manual checkpoint pending:** each passkey now receives a stable, canonical 32-byte PRF input; PRF output is extracted and zeroed only in browser memory; the server records capability without receiving the output; recovery readiness requires two PRF-verified credentials; and revocation cannot reduce that set below two. Production completion requires two real authenticators, repeat verification after sign-out, and the recovery/revocation ceremony below.
   - **Signing boundary decided 2026-08-17:** KudiRoll will not generate or escrow a Starknet signer private key. Extensionless transactions use an external self-custodial Starknet smart account through an account-valid signer adapter; the initial provider target is Argent Web Wallet. Guardian/co-signer signatures must be preserved intact.
3. **E2 — SDK worker — E2a implemented locally 2026-08-18; E2b externally gated:** E2a adds the dedicated worker/client boundary, transfers and zeroes PRF material, decrypts the vault only inside the worker, and returns only public lock/account/provider status. E2b must pin Privacy SDK `0.14.3-rc.5`, use its explicit browser export inside that worker, connect the embedded smart account through the account-valid signer adapter, and register/discover without exposing keys to React or Express. Mainnet release requires a reproducible authenticated SDK install, official prover/discovery endpoints, and an embedded-wallet SDK compatible with the app's current starknet.js line; no endpoint or signature format may be guessed.
4. **E3 — private payroll:** shield, consented balance, atomic multi-recipient transfer, withdrawal, finality, maturity, history, and safe retry through the embedded wallet.
5. **E4 — cutover:** hide extension discovery from the customer build only after the embedded route produces verified Mainnet evidence; retain an internal recovery/certification build behind deployment access controls.

Current SDK evidence: the official RC.5 source exposes `./browser`, builds with `platform: browser`, and has a browser test suite. Its GitHub Packages distribution requires authenticated installation, so E2 must establish a reproducible CI/Railway package path without committing or repurposing a developer token.

## 3B. Approved product pivot — Africa-first KudiRoll Rail

**Decision 2026-08-18:** KudiRoll will separate into KudiRoll Rail, a non-custodial private-payroll orchestration API, and KudiRoll App, the first-party reference client. The launch claim remains Nigeria-first until a complete NGN settlement is certified; Kenya, Uganda, Tanzania, Malawi, and any other corridor remain disabled until independently verified.

- Rail servers may own tenants, teams, immutable pay-run intents, idempotency, public transaction evidence and signed lifecycle webhooks.
- Rail servers never receive plaintext signing keys, viewing keys, notes or proofs and never submit payroll on a customer's behalf.
- The app or integrating customer's approved wallet converts the deterministic execution manifest into STRK20 operations and requests user approval.
- Worker-controlled local settlement is a later, separate public exit; its amount, address and timing are public, and the payout provider knows the verified recipient.
- Employer shielding and private payroll must not be bundled with worker settlement because that would make correlation materially easier.

## 4. What this delivers — hidden vs visible

| Private inside STRK20 | Public onchain or at the settlement boundary |
| --- | --- |
| Sender and recipient of each private payroll transfer | Shield and unshield amounts |
| Individual payroll amount and token type | The fact and timing of a wallet's pool deposit or withdrawal |
| Notes spent and change notes created | ERC-20 approval and public deposit/withdrawal legs |
| Link between workers inside an atomic private payroll batch | The intentional Paycrest recipient address and unshielded amount |
| Unrelated workers and transfers during a legitimate disclosure | Paycrest order status and local-fiat settlement evidence held under its own retention rules |

Shielding will be a separate, earlier transaction from payroll so the public deposit is not trivially bundled with the private transfer it funds. This adds a maturity wait and another pool fee, but gives the payroll flow its intended unlinkability.

The public settlement boundary is useful evidence, not automatic AML compliance and not proof that a specific earlier private note funded the exit. KudiRoll must not claim regulator approval, universal traceability, or compliance by protocol alone.

## 5. Sprint success gates

| Judging area | Required evidence before calling it complete |
| --- | --- |
| STRK20 integration depth — 30% | `WalletAccountV6`, privacy capability detection, consented balance, separate shield, maturity/readiness, live fee handling, atomic multi-recipient private transfer, and intentional unshield |
| Working mainnet product — 30% | Stable public HTTPS deployment, managed database and sessions, completed Ready flow, final transaction receipts, monitoring, recovery, and at least three successful pool-touching hashes |
| Innovation — 25% | Reusable African-business payroll workspace, atomic team payments, preflight/readiness engine, immutable pay-run evidence, and an implemented auditable STRK20-to-Paycrest settlement boundary |
| Documentation — 15% | MIT license, reproducible setup, architecture, hidden-versus-visible model, threat model, security policy, contribution guide, deployment/runbook, demo video, and complete `strk20.json` |

## 6. Prerequisites and versions

- Use exact `starknet@10.7.0`; the Phase 1 typecheck proved that 10.4.0's bundled Wallet Standard 6.0.2 types are incompatible with current discovery 6.0.4.
- Replace `@starknet-io/get-starknet@4.0.8` with exact pins `@starknet-io/get-starknet-discovery@6.0.4` and `@starknet-io/get-starknet-wallet-standard@6.0.4`.
- Add exact pin `@starknet-io/types-js@0.10.3`, matching the latest stable Privacy Wallet API.
- Treat Wallet API `0.10.4-rc.1` and types-js beta releases as unsupported until stable and explicitly re-certified.
- Test with the current Ready extension and the public wallet test dapp.
- Re-run the skill freshness checker and fetch the current WalletAccount guide before Phase 1 implementation; if 6.0.4 regresses the documented STRK20 flow, record the evidence and temporarily use the last verified 6.0.3 pair rather than mixing patch versions.

## 7. Phase 0 — public, reproducible baseline ✅ done 2026-08-15

**Status:** complete. Baseline commit `cad7162` created the reviewed source; commit `82ac7ff` moved CI to current GitHub Actions v7; both local and clean-clone checks passed with 15/15 tests, typecheck/build success, and zero npm vulnerabilities. The public repository and MIT license are verified; registry submission remains Phase 7 because the required public Telegram username is not yet supplied.

1. Review all untracked files and generated/local data exclusions; confirm no worker, wallet, bank, credential, or secret data can enter git.
2. Add MIT `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, root `strk20.json` with empty evidence fields, and repository metadata.
3. Run clean install, typecheck, tests, production build, and dependency audit.
4. Create the first reviewed commit and public `Cyano88/kudiroll` repository only after the owner confirms publication.
5. Keep the registry PR separate until the public repository exists and a project-facing Telegram username is supplied.

**Exit:** a clean public source baseline with green CI and no deployment claim.

**Manual check:** clone into a new directory, install, test, build, and inspect the public repository for sensitive data.

## 8. Phase 1 — WalletAccountV6 foundation and first shield flow

**Status:** implementation complete 2026-08-15; Ready discovery remediation added 2026-08-16; manual Ready/Mainnet checkpoint pending. KudiRoll now excludes unrelated EIP-6963 virtual wallets, retries delayed extension injection, rescans on browser return, and offers a manual Ready scan. No Mainnet transaction was submitted.

1. Update `package.json` and lockfile to the exact packages in Section 6.
2. Replace the connector use in `src/App.tsx:2` and `src/App.tsx:220-258` with get-starknet v6 discovery and a typed `WalletAccountV6` adapter.
3. Refactor `src/phase0.ts` behind a small wallet service so UI code no longer constructs raw `wallet_strk20*` request objects.
4. Detect privacy support with the wallet API version query only; never use a balance read as feature detection.
5. Preserve wallet-signed KudiRoll authentication for supported non-privacy wallets while disabling private actions with a precise Ready requirement.
6. Add a shield screen that names the two wallet prompts: public ERC-20 approval, then public deposit into STRK20.
7. Surface screening rejection, user rejection, wallet incompatibility, submission timeout, and explorer fallback states without calling them application bugs.
8. Add unit tests for version parsing, address normalization, action construction, timeout handling, and graceful degradation.

**Exit:** Ready connects on Mainnet, KudiRoll identifies STRK20 capability without requesting private data, and the smallest safe shield operation can be simulated/submitted through `WalletAccountV6`.

**Manual check:** compare connection and shield behavior with the wallet test dapp; confirm unsupported wallets can still sign in but cannot start private payroll.

## 9. Phase 2 — shielded treasury readiness

**Status:** implementation complete 2026-08-15; history remediation added 2026-08-16; manual Ready/Mainnet checkpoint pending. KudiRoll persists only public shield hash, amount, and timestamp, exposes tracked shields independently in Transaction History, queries Starknet receipts server-side, distinguishes pending/reverted/unknown states, enforces the documented 10-block maturity window, restores state after refresh, and gates payroll simulation/submission. An unconfigured Paycrest provider now degrades without replacing core account history. No Mainnet transaction has been verified by KudiRoll yet.

1. Add a deliberate consent action for showing private USDC balance; do not request it automatically on connect.
2. Let the Wallet API calculate and display the current pool fee at approval time; its prepare result does not expose a standalone pool-fee field, so KudiRoll never invents or hard-codes one.
3. Track the shield transaction hash and final status, then display note maturity/readiness before enabling payroll.
4. Explain why a newly shielded note cannot be spent immediately and why KudiRoll does not bundle shield with payroll by default.
5. Apply a disclosed 0.01 USDC KudiRoll product minimum and surface wallet simulation failures for insufficient public USDC or current fee allowance.
6. Persist only public transaction references and app workflow state; never persist notes, proofs, viewing keys, or wallet-private balance data.

**Exit:** the treasury panel truthfully reports whether the wallet, balance consent, fee allowance, finality, and maturity prerequisites are ready.

**Manual check:** shield a minimal Mainnet amount, capture the successful hash, verify finality, wait for maturity, and confirm payroll remains disabled until ready. This mainnet action requires explicit confirmation at execution time.

## 10. Phase 3 — atomic private payroll — implementation candidate 2026-08-16

**Status:** atomic action construction, immutable snapshots, durable submitting/unknown/submitted/finalized states, late wallet-hash recovery, duplicate-recipient/hash rejection, unresolved-submission locking, fresh-passkey retry release, and server receipt/pool-event verification are implemented. The canonical Mainnet pool address is verified against the sprint's Day 0 guide and transaction verifier; completion still requires one manually certified Mainnet batch paying at least two Ready-registered recipients.

1. Migrate `src/App.tsx:767-800` and `src/App.tsx:876-877` to the typed wallet service while preserving one immutable pay-run snapshot and the `PAY TEAM` confirmation.
2. Validate every recipient address, normalize felts with numeric equality, and reject duplicates or zero/invalid amounts before asking the wallet to prepare.
3. Submit all private transfer actions as one wallet request; never loop over recipients into separate approval flows.
4. Record submitted hash, explorer link, final receipt, failure/revert state, and a safe retry path without allowing duplicate payroll submission.
5. Add server-side receipt verification before `src/server/account-store.ts` can mark a pay run final.
6. For pool activity/history, never attribute a private transaction by transaction sender; use protocol events, and use the first indexed key of the pool `Deposit` event for deposit attribution.
7. Expand tests for atomic preparation failure, immutable snapshots, idempotency, receipt verification, and timeout recovery.

**Exit:** one finalized Mainnet transaction privately pays at least two Ready-registered recipients atomically and the saved pay run matches the confirmed receipt.

**Manual check:** simulate first, compare every sanitized recipient and amount in Ready, approve once, verify finality in the explorer, and confirm refresh/reconnect restores the correct state. This mainnet action requires explicit confirmation at execution time.

## 11. Phase 4 — controlled Paycrest settlement boundary

**Status:** planned; live money remains disabled until every exit criterion passes.

1. Keep `src/server/paycrest.ts` server-only, secrets out of logs/client bundles, and HMAC webhook verification mandatory.
2. Extend `src/server/phase0-router.ts` with an idempotent order lifecycle: created, awaiting deposit, detected, processing, paid, expired, refunded, failed, and manually reviewed.
3. Bind the wallet session, pay-run reference, public withdrawal hash, Paycrest order ID, verified recipient reference, payout status, and refund outcome into an encrypted evidence record.
4. Store masked/minimal recipient details; separate operational access from investigation export access and audit every evidence access.
5. Add sanctions/KYB policy hooks, configurable amount/velocity limits, risk flags, manual review, retention, deletion, and incident procedures. These are KudiRoll responsibilities, not guarantees supplied by STRK20 or Paycrest.
6. Update `src/App.tsx:369-489` to call the action an intentional public settlement exit, explicitly displaying that its address, amount, and timing are public.
7. Certify account verification, order creation, exact-amount validation, deposit detection, signed webhook processing, fiat completion, expiry, refund, reconciliation, and recovery with capped amounts.
8. Keep the feature labelled pilot and live-order creation off if Starknet aggregator support or any lifecycle state cannot be verified.

**Exit:** a capped end-to-end settlement succeeds or fails safely with a complete sanitized evidence package; no anonymous or automatic-compliance claim appears anywhere.

**Manual check:** use a designated test recipient and smallest safe amount, verify every state transition and webhook signature, confirm the public unshield evidence, and verify completed fiat delivery or automatic recovery. This mainnet action requires explicit confirmation at execution time.

## 12. Phase 5 — production infrastructure and security

**Status:** managed PostgreSQL, durable authentication, encrypted account persistence, schema migration 001, and Railway production activation are complete as of 2026-08-18. Backup/restore, reverse migration, multi-instance restart testing, and the final operating drill remain pending.

1. Replace `src/server/account-store.ts` JSON storage with managed PostgreSQL, schema migrations, encrypted sensitive columns, retention, deletion, backups, and a restore drill.
2. Replace the `Map` in `src/server/account-router.ts:10` with durable revocable sessions, rotation, expiry, secure cookies, origin/CSRF controls, and per-wallet/IP rate limits.
3. Add idempotency keys and database uniqueness constraints around pay-run and Paycrest submissions.
4. Add structured redacted logging, error monitoring, availability checks, alerting, dependency review, and an incident/rollback runbook.
5. Add a read-only public product tour using sanitized fixtures; all money actions still require a connected wallet.
6. Expose build commit SHA and deployment time in `/api/health` and the application footer.
7. Add a post-deploy smoke test that fails the release when health, asset version, API version, or expected commit does not match.

**Implemented slice 2026-08-18:** migration 001 creates per-wallet account rows plus hashed session and single-use challenge tables; `KUDIROLL_AUTH_BACKEND=postgres` explicitly enables the durable auth adapter only after migration; `/api/health` reports configuration and reachability without exposing the database URL. The file backend remains the rollback default, and the app must remain single-replica until account/payroll persistence is cut over and migration-tested.

**Second persistence slice 2026-08-18:** account, team, worker, pay-run, public shield, passkey metadata and already-encrypted wallet-backup records can be imported into per-wallet PostgreSQL rows. Each row is wrapped again with AES-256-GCM using wallet-address authenticated data; SQL rejects plaintext-shaped rows, writes are serialized transactionally across instances, unchanged tenants are not rewritten, imports require an empty target, and health returns 503 when a selected database backend is unreachable or below schema version 1. Production activation proceeded after live schema health and database integration checks; backup/restore and reverse-migration drills remain required, and switching back to the old file after new database writes would restore stale data.

**Production activation 2026-08-18:** Railway runs the PostgreSQL account and authentication backends with schema version 1. Health reports the exact release commit and database readiness. The remaining resilience drills above are required before the infrastructure phase is called fully complete.

**Exit:** the deployed service tolerates restart/multi-instance operation, protects sensitive payroll data, and proves which commit is live.

**Manual check:** restart instances during a session, exercise idempotent recovery, restore a backup in isolation, and verify logs contain no payroll, wallet-private, bank, or secret data.

## 13. Phase 6 — Mainnet certification and anti-stale deployment

**Status:** public-alpha deployment and the production UI release are live on Railway as of 2026-08-19; Mainnet certification remains pending. Railway deploys `main` through `railway.json`, `/api/health` reports the explicitly pinned Git commit, and signed-out desktop/mobile smoke tests pass at `https://kudiroll-production.up.railway.app`. No Mainnet evidence transaction has been submitted.

1. Deploy only a CI-built artifact from the reviewed main commit; record artifact digest, commit SHA, environment, and deployment URL.
2. Require post-deploy smoke tests and compare the live commit with GitHub before announcing a release.
3. Produce at least three successful Mainnet transactions touching the STRK20 pool: a shield, an atomic multi-recipient payroll, and either a second payroll or intentional Paycrest unshield.
4. Verify each hash exists, succeeded, touched the canonical pool, and corresponds to the documented flow before placing it in `strk20.json`.
5. Keep technical evidence sanitized: wallet/API versions, recipient count, token contract, simulation result, transaction hash, final status, application state, and recovery outcome.
6. Test the public URL from a signed-out browser and mobile viewport; no conventional login or private invitation may block the product tour.

**Production UI release 2026-08-19:** all product surfaces use the official Heroicons React package, self-hosted Plus Jakarta Sans with its OFL license, persisted light and dark themes, responsive desktop/mobile navigation, accessible icon labels, and a reduced-motion-aware CSS loading ring with no arrow glyph. Automated browser sweeps cover sign-in, every main section, both themes, and the mobile More dialog; Railway served the matching production asset hashes before the final exact-SHA release check.

**Exit:** public URL is current, stable, independently openable, and `strk20.json` contains only verified evidence.

## 14. Phase 7 — open-source package, registration, and pitch

**Status:** planned.

1. Finish README quickstart, architecture, privacy model, threat model, supported-wallet matrix, production runbook, API/deployment guide, security contact, contribution guide, and limitations.
2. Add repository description, website URL, Payments category, and `inspired_by: "RFP-11"` positioning.
3. Open the single registry PR with `https://github.com/Cyano88/kudiroll` and the owner-provided public Telegram username; do not modify unrelated registry entries.
4. Record a three-minute demo: problem, separate shield, readiness, atomic payroll, explorer evidence, intentional settlement boundary, and open-source handoff.
5. Fill `strk20.json` with three or more verified hashes, any genuinely deployed contracts, demo video, and demo URL. Leave `contracts` empty if KudiRoll deploys none.
6. Publish the concise pitch: “KudiRoll is the private payroll operating system for African businesses: confidential team payments inside STRK20, with an intentional and auditable path to verified local settlement.”

**Exit:** the hackathon hub can discover and score every required artifact without private access or explanation from the builder.

## 14A. Phase 7A — KudiRoll Rail extraction

**Status:** logical API boundaries implemented 2026-08-18; physical extraction transport implemented locally 2026-08-19; separate KudiRail repository/deployment and external developer access remain pending.

1. Mount `/api/v1` as a separately versioned rail surface while retaining `/api/account` for identity, teams, recovery and transitional finality routes.
2. Require persisted idempotency for pay-run creation and reject reuse with request drift.
3. Return a deterministic non-custodial execution manifest containing only worker IDs, Starknet recipients and USDC amounts; exclude worker names and every wallet-private value.
4. Make KudiRoll App create and execute payroll from that manifest while keeping simulation, signing and submission in the client wallet.
5. Document the current first-party session boundary honestly; do not release API keys until managed PostgreSQL, tenant isolation, scoped credentials, signed webhooks, revocation, rate limits and audit logs are complete.
6. **Done locally 2026-08-18:** finality and fresh-passkey unknown-outcome recovery now run through `/api/v1`; legacy account routes delegate to the same finality service for rollback compatibility.
7. **Done locally 2026-08-18:** `src/rail/client.ts` owns the versioned payroll paths and KudiRoll App consumes it instead of constructing raw payroll URLs.
8. **HTTP contract gate done locally 2026-08-18:** an authenticated in-process server test exercises capability discovery, session isolation, pay-run creation, manifest privacy and idempotent replay. Physical frontend extraction still waits for production database isolation.
9. **Physical split foundation done locally 2026-08-19:** KudiRoll resolves every server request through a validated `VITE_KUDIRAIL_API_URL`, includes API-hosted credentials, and KudiRail enforces an exact `KUDIRAIL_ALLOWED_ORIGINS` policy with tested preflight and hostile-origin rejection. Same-origin fallback remains the production rollback until the separate service passes database, WebAuthn and session cutover drills.

**Manual check:** create one draft from KudiRoll App, confirm `/api/v1` returns client custody, confirm the manifest contains no worker name or secret, simulate without submission, refresh the account and verify exactly one pay-run record exists.

## 15. Testing strategy

- Headless gate for every phase: clean install, typecheck, all tests, production build, dependency audit, and focused new regression tests.
- Wallet gate: Ready extension plus the public wallet test dapp; capability, rejection, timeout, reconnect, and unsupported-wallet cases.
- Network gate: Mainnet only for evidence-producing operations, always using the smallest safe amount and explicit owner confirmation immediately before submission.
- Backend gate: migration, session revocation, rate limiting, idempotency, webhook authenticity, tenant isolation, receipt verification, backup/restore, and redaction tests.
- Deployment gate: expected commit SHA, asset version, health, public-tour access, mobile layout, and rollback verification.
- Local tests cannot certify the wallet prover or live pool; no phase is marked complete from mocks alone.

## 16. Compliance and security boundaries

- Deposit screening is enforced onchain by the protocol and applies regardless of prover route; KudiRoll must surface a rejection without implying it can be bypassed.
- Selective disclosure can support a legitimate request without exposing unrelated users, but KudiRoll does not receive viewing keys and must not promise an in-app cryptographic disclosure feature it cannot implement through the current wallet route.
- Paycrest requires the integrating sender to own its applicable KYC/KYB, sanctions, AML/CFT, reporting, and jurisdictional obligations; integration is not legal approval.
- Investigation exports require defined authorization, purpose, audit logging, minimization, encryption, retention, and deletion controls.
- No worker name, bank detail, viewing key, wallet secret, proof, note, OTP, recovery phrase, or production credential may enter git, public telemetry, demo fixtures, or `strk20.json`.

## 17. Open items and drift to re-verify

- get-starknet `next` moved from 6.0.3 to 6.0.4 on 2026-08-15; confirm the current WalletAccount guide and Ready behavior before installation.
- `starknet@10.7.0` is now pinned because it aligns its bundled Wallet Standard v6 types with discovery 6.0.4; re-check before later upgrades.
- Wallet API stable is 0.10.3; 0.10.4 remains prerelease and is out of scope.
- The current WalletAccount guide names Ready and Xverse as STRK20-capable; Ready remains the first hands-on certification target until both are manually verified.
- Read the pool fee at build/run time; never promise a historical fee.
- Canonical Mainnet pool address verified 2026-08-16 in two official sprint sources: `docs/MAINNET-DAY-0.md` and the `POOL_ADDRESS` used by `scripts/build-projects.mjs` to score transaction receipts.
- Confirm Paycrest Starknet aggregator support and the full live lifecycle before enabling orders; documentation and API behavior may differ during rollout.
- Wallet-route private sub-accounts and the newly observed `shadow_account_anonymizer` package are out of sprint scope unless stable wallet support ships and the core is already certified.
- Ready appearing in the older public test dapp but not KudiRoll was traced to KudiRoll's one-shot injected-wallet scan and default EIP-6963 virtual-wallet noise; the 2026-08-16 remediation still requires confirmation in the owner's Ready-enabled browser.
- WebAuthn challenges and KudiRoll sessions persist as hashed, expiring records on the mounted volume after E1b, but the JSON adapter remains single-writer infrastructure; the Railway service must stay single-replica until a transactional managed store replaces it.
- Freshness check on 2026-08-18 found `@starknet-io/get-starknet-wallet-standard` next at 6.0.5 while KudiRoll remains pinned to tested 6.0.4; E1c does not touch wallet discovery, so upgrade only after a separate compatibility pass.
- The 2026-08-18 freshness check also found discovery next at 6.0.4, wallet-standard next at 6.0.5, removal of `sub_account_anonymizer`, and a new `shadow_account_anonymizer`; none affects this database slice, and the tested application pins remain unchanged.
- Railway CLI database discovery failed before returning project data with TLS `BadRecordMac`; no database was provisioned, migrated, configured or activated in this phase.
- The encrypted account adapter preserves existing cross-account passkey uniqueness and pay-run idempotency by taking a PostgreSQL advisory transaction lock and loading encrypted account rows before mutation. This is correct for sprint-scale traffic but remains an O(n) path; replace it with row-scoped repositories and database uniqueness tables before high-volume public API access.
- `KUDIROLL_DATA_ENCRYPTION_KEY` currently supports one active key. Production activation requires a tested key-rotation and reverse-migration procedure; losing the key makes encrypted account rows unrecoverable.
- WebAuthn PRF is not a recovery mechanism: do not generate embedded-wallet secrets until KudiRoll supports at least one separately authorized recovery credential and a tested credential-revocation ceremony.
- E2 preflight reconfirmed official SDK `0.14.3-rc.5`, Node.js 24+, and the explicit `./browser` export. RC.5 renamed the former sub-account surface and package to shadow accounts; KudiRoll does not depend on that experimental path in E2.
- GitHub Packages returned `401 Unauthorized` without authentication and the official RC.5 release contains no downloadable package asset. Resume E2 only after a dedicated read-only Packages token is supplied to local npm, CI, and Railway without committing it or repurposing an existing developer token.
- The E2a pre-build audit on 2026-08-18 found `starknetkit@3.4.3` peers on `starknet@^8.0.0`, while KudiRoll requires `starknet@10.7.0` for its tested STRK20 Wallet API path. Do not install it with peer overrides; the provider connection remains gated on an officially compatible release or a separately reviewed provider adapter.
- Phase 3 finalization remains `unknown` unless `STRK20_POOL_ADDRESS` is configured and the successful receipt contains an event from that exact address; receipt success alone is not proof that payroll touched STRK20.

## 18. Links

- STRK20 model: https://strk20-by-example.org/what-is-strk20
- Builder privacy overview: https://strk20-by-example.org/builder-privacy-overview
- Wallet API overview: https://strk20-by-example.org/starknet-wallet-api/overview
- starknet.js / WalletAccountV6: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- React integration: https://strk20-by-example.org/starknet-wallet-api/starknet-start-hook
- Screening and selective disclosure: https://strk20-by-example.org/compliance
- Current WalletAccount guide: https://starknet-js.com/docs/next/guides/account/walletAccount/#with-get-starknet-v6
- Wallet test dapp: https://starknet-wallet-account.vercel.app/
- Privacy SDK monorepo (reference only for this route): https://github.com/starkware-libs/starknet-privacy
- STRK20 hackathon registry: https://github.com/starkience/strk20-hackathon
- Paycrest compliance model: https://docs.paycrest.io/concepts/compliance-security

## 19. Execution protocol

- Application code changes begin only after the owner explicitly approves this plan.
- Before every phase, audit the current implementation, dependency/API drift, secret boundaries, automated checks, and deployment assumptions; record a go/no-go result before editing.
- Execute one phase at a time; mark its heading `✅ done YYYY-MM-DD`, record drift/blockers here, run all automated gates, hand off the manual checklist, and wait for confirmation before advancing.
- If the owner explicitly defers a manual checkpoint, keep it recorded as an unverified release blocker; later phases may proceed, but the deferred phase is never described as production-certified.
- Mainnet-affecting wallet actions always require explicit confirmation at the moment of submission even after this plan is approved.
- The STRK20 skill changes application code only and will not generate Cairo contracts.
