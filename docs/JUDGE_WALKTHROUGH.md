# Judge walkthrough

A two-minute tour of the current [public read-only demo](https://kudiroll-production.up.railway.app/demo). No wallet, sign-in or payment is required. Demo records are labeled sample data; Mainnet evidence is linked separately. The [uploaded video](https://youtu.be/0Aa_1LXS-Gw) remains unchanged.

Read the [evidence summary](SUBMISSION_NOTE.md#start-here-what-the-evidence-establishes) first: it distinguishes Mainnet payment evidence from synthetic product checks.

1. **Home:** See the Personal payroll and Enterprise entry cards, their separate record counts and links to items requiring attention.
2. **Personal payroll:** Open Team, Pay runs and History. Inspect the sample saved pay run and its available evidence. The no-setup wallet route exposes recipient addresses and withdrawal amounts; fully private transfers require compatible registered recipient wallets.
3. **Enterprise:** See the same Overview, Team, Pay runs, Payout methods and History structure with separate records. An empty Enterprise workspace does not mean Personal records were lost. Enterprise private payroll pays shielded USDC; staff roles and two-person approval are not available yet.
4. **Payout methods:** Review shared funding and payroll controls, then the bank payout route and its return navigation. Both workspaces use the connected wallet's funds. The Nigerian bank route is beta: settlement is public and the provider knows bank details.
5. **Evidence:** Open the [submission note](SUBMISSION_NOTE.md). It links private-transfer receipts and the bank funding receipt, explains what public chain evidence proves, and records the latest provider discrepancy. A successful funding transaction is not proof of Naira delivery.

## Reliability evidence

The demo does not simulate a production outage or certify recovery. Review the [recovery remediation and validation](FLOW_AUDIT.md#recovery-remediation---6-september-2026) for durable funding attempts, ambiguous bank-order recovery and uncertain payroll handling. Review [navigation validation](NAVIGATION.md) for workspace isolation and mobile checks.

## Current unresolved integration result

On 6 September 2026 at 09:45 UTC, the existing Paycrest order reported `expired`, with zero detected payment and zero returned funds. The independently checked Starknet receipt proved its exact funding transfer before expiry and was accepted on L1. Deposit detection, bank delivery and refund remain unconfirmed; provider reconciliation is the next integration milestone.

## Enterprise onboarding checkpoint - 6 September 2026

An isolated authenticated browser session created an Enterprise team, imported two synthetic workers from CSV, and displayed both in the private pay-run composer with a combined 0.300000 USDC total. Personal records remained separate. No wallet was connected and no payment was sent.

The current Save and review action requires Ready and a checked private balance. Consequently, this session does not certify the complete wallet-connected draft-creation flow. Earlier synthetic checks covered reopening a saved Enterprise run from History; the next operator check is to save a new Enterprise draft with Ready connected and reopen it from Enterprise History. Saving a draft does not itself submit payment. Do not present sample drafts or this onboarding check as additional Mainnet payment evidence.
