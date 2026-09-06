# Enterprise workspace

## First build

Enterprise is a separate tab with Overview, Teams, Private payroll, Bank payout, History, and Funds & controls. It has its own saved teams, payroll records, and KudiRail bank orders. Existing records without a workspace tag remain in the main workspace. Teams can use the same name in both spaces and cannot be moved between them by editing.

This phase remains wallet-owner operated. Both spaces share the connected wallet, its balance, and existing payroll policy. Enterprise does not create separate custody, staff permissions, or two-person approvals.

## Payment routes

- USDC to USDC: private STRK20 transfers only. Every recipient must be registered through a compatible wallet. The server rejects Enterprise public-wallet payroll. Existing simulation, policy checks, client signing, and unknown-outcome recovery remain in place.
- USDC to Naira: the existing Paycrest beta, funded by an unshield from the private USDC balance. The settlement address and amount are public and the provider knows bank details. Deposit detection and bank delivery remain under validation. The route is not an end-to-end private bank transfer.

Unknown payroll outcomes and unresolved bank orders block new attempts account-wide, including attempts from another workspace. The local KudiRoll fallback rejects Enterprise bank-order creation because durable bank records are implemented in KudiRail.

## API and persistence

Team creation and pay-run creation accept `workspace: "enterprise"`; omitted scope defaults to `standard`. Scope is immutable on saved teams and pay runs. Pay runs must match the scope of the stored team. Enterprise scope is bound into the intent hash and included in the sanitized evidence. Existing standard/legacy intent hashes and idempotency payloads retain their original format.

Bank-order creation validates scope before calling Paycrest and persists it on the KudiRail order. Reconciliation never changes the saved scope. No database schema migration is needed: the optional field lives inside the existing encrypted account record. Workspace tags organize records within an authenticated wallet; they are not a multi-user authorization boundary.

## Validation and rollout

Local automated checks: KudiRoll 88 tests and KudiRail 71 tests, including scope mismatches, private-only enforcement, tenant isolation, legacy behavior, idempotency, and cross-workspace duplicate-payment blocking. Both builds/typechecks passed. The frontend retains the pre-existing module-federation eval warning. Browser checks passed using synthetic records and no connected wallet: Enterprise team creation, isolation from main Team, private-only composer, scoped History, mobile More entry, and bank beta route. Mobile content width was 390px at a 390px viewport; browser console had no errors. No real payment was made.

Deploy KudiRail before KudiRoll so the backend recognizes Enterprise scope. Do not roll back the backend independently while retaining an Enterprise-capable frontend. Rollback must preserve existing tagged records. This first build has not been deployed or tested with a live Enterprise payment.

Manual review: open Enterprise, create a team, verify it stays out of the main Team tab, check both route labels, and confirm History stays scoped. This review requires no funds. Existing wallet actions follow https://strk20-by-example.org/starknet-wallet-api/overview.

## Next phase

Define organization membership separately from signing wallets. Add administrator, preparer, approver and auditor roles; prevent self-approval; bind approval to immutable recipients, amounts, route and policy; invalidate approvals on changes; enforce permissions on every API path; test revocation and tenant separation. Bank quote expiry requires fresh approval when the exact provider payment changes. Do not present these roles as implemented until their server authorization and recovery tests pass.
