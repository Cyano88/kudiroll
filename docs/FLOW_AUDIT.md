# KudiRoll flow audit - 6 September 2026

Status: audited changes prepared for Git publication; production deployment is not verified. Covers KudiRoll and the standalone KudiRail service, including the uncommitted Enterprise phase. This is a source, regression-test and synthetic-browser audit, not a formal security certification. No new payment was signed or sent.

## Findings fixed locally

| Priority | Finding | Change and evidence |
| --- | --- | --- |
| High | Drafts created before another submission could still proceed while that submission was unknown. | Both stores now check all account workspaces when preparing and authorizing submission. Regression tests cover two pre-existing drafts and recovery. |
| High | A generic wallet error after invocation could label payroll failed and allow a duplicate retry. | All errors after wallet invocation retain an unknown outcome. Late successful results still record their hash. Rejected pre-wallet authorization does not mark a potentially concurrent submission failed. Even cancellation requires recovery review because an error message alone cannot prove absence of broadcast. |
| High | Equivalent padded transaction hashes could attach to two payroll records. | Payroll hash identity and immutability use numeric felt comparison. Regression rejects 0xabc versus 0x0abc reuse. |
| Medium | Bank refresh could reopen a standard order inside Enterprise. | Auto-recovery filters workspace and discards responses after an account/workspace change. Account-wide backend bank blockers remain. |
| Medium | Changing amounts, team or selection left an earlier saved batch approvable below the edited composer. | Composer edits clear the active review. Existing saved records remain in History. |
| Medium | Saved drafts could not be resumed after navigation/reload. | History offers Review saved run, fetches its authenticated execution manifest, restores composer values and requires a fresh simulation. Snapshot review remains visible even if its original team is gone. |
| Medium | Sign-out retained bank history, beneficiary fields and funding UI state. | Explicit cleanup clears these fields and pending email-link state. Full async session fencing remains open below. |
| Low | Payout methods could display a stale disabled provider gate until Bank payout was visited. | Entering Payout methods also refreshes provider health. |
| Low | Passkey success implied recovery of the connected Ready wallet; shield wording implied cancelling any stage sent nothing. | Copy distinguishes app sign-in/PRF support from Ready recovery and discloses separate approval/deposit transactions. |

## Flow assessment

- Entry and account access: wallet, email and passkey routes exist. Authentication, challenge reuse, encrypted record isolation, origin checks and session persistence have regression coverage. No real authenticator reset or external-wallet recovery was performed in this audit.
- Teams: standard and Enterprise records are separate; names can repeat across workspaces, and saved team scope is immutable. Payments retain recipient snapshots. Canonical recipient-address deduplication should also be applied at worker entry rather than relying on later action validation.
- Funding: public approval/deposit, chain acceptance and the ten-block maturity gate are explicitly separated. The unresolved timeout path below remains important.
- Payroll: private transfers and public-recipient withdrawals are distinct, manifests bind payment intent and policy, balance is rechecked before wallet invocation, and only client wallets sign. Enterprise permits private payroll only. Policy reserve and maximum are payroll controls, not a bank-wide treasury guarantee.
- History: submitted versus finalized versus unknown are distinct. Evidence exports explain private-chain proof limits. The new resume action uses the saved run, not a newly created payment.
- Bank payments: public withdrawal evidence and Paycrest settlement are distinct. Beta wording remains appropriate. A successful Starknet withdrawal alone does not establish beneficiary bank credit.
- Enterprise: separate records and navigation are implemented locally. Funding and policy still belong to the same wallet. Staff roles, independent approvers and organizational authorization are not implemented.
- Layout: existing desktop/mobile Enterprise structure was inspected with synthetic data. New saved-run navigation was exercised in the browser; amount edits remove its review. Avoid a broad visual redesign while payment recovery work is open.

## Open work, in order

1. **High - durable funding recovery.** `App.tsx:shieldUsdc` still treats a timeout/storage failure as failed; a hash is displayed only after the server write. Capture the returned public hash before storage, preserve late results, persist a recoverable attempt and prevent blind resubmission. Include refresh/reload, lost response and failed persistence tests.
2. **High - atomic bank-order creation.** Standalone `phase0-router.ts` checks eligibility, calls Paycrest, then records the order in separate steps. Concurrent requests can create provider orders before either record exists. Introduce a durable per-account reservation and provider idempotency/reconciliation; a process-local mutex is insufficient across replicas. This race was identified in source, not exercised against live Paycrest.
3. **High - server recovery protocol.** The generic payroll PATCH still permits submitting-to-failed without an explicit recovery reason. The UI fix reduces ordinary retries but does not harden alternate/stale clients. Restrict this transition through a deliberate recovery protocol, including authorization that succeeded before the wallet was opened, with compatibility tests.
4. **Medium - complete session fencing.** Logout cleanup and bank-context fencing do not cancel every pending account/balance/funding request. Add a session generation boundary for all asynchronous account-owned updates and test logout/relogin with delayed responses.
5. **Medium - recovery usability.** Unknown payroll without a hash requires the existing passkey-authenticated recovery endpoint. Provide a clear reauthentication route and an explicit recovered-hash entry flow. Distinguish app access recovery from recovery of a third-party wallet.
6. **Medium - cross-workspace blockers.** When another workspace owns an unresolved bank/payroll attempt, the UI should link directly to that workspace's History. Keep the existing account-wide block.
7. **Medium - provider settlement reconciliation.** Existing chain payment evidence does not resolve the provider's initiated/zero-paid state. Keep Naira beta and do not relabel it completed until provider or bank evidence establishes delivery.
8. **Low - consistency and simplification.** Split the large App component into account access, funding, payroll and bank modules after behavior is covered. Consolidate recovery notices and use one primary next action per state. Review legacy recovery copy throughout Settings, not only the registration message.

## Validation

- KudiRoll: 88 tests passed.
- KudiRail: 71 tests passed; TypeScript build passed.
- KudiRoll production build passed; existing dependency eval warning remains.
- Synthetic authenticated browser: History -> Review saved run loads the saved snapshot; editing the amount clears it. No wallet connected and no payment attempted.
- Previous Enterprise checks in this working session covered standard/Enterprise team and history isolation, private-only payroll controls, bank beta copy, and a 390-pixel mobile viewport.

These changes need backend-first deployment with the existing Enterprise changes. This audit does not claim that open recovery and concurrency issues are fixed or that live production includes the local patch.
