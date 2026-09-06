# Submission note

## Start here: what the evidence establishes

KudiRoll combines STRK20 payroll with reusable teams and a durable KudiRail backend. Start with the [submitted video](https://youtu.be/0Aa_1LXS-Gw), [live read-only demo](https://kudiroll-production.up.railway.app/demo), and [two-minute walkthrough](JUDGE_WALKTHROUGH.md).

| Evidence | What it establishes | Limit |
| --- | --- | --- |
| [Two-recipient Mainnet payroll](https://starkscan.co/tx/0x6d75bc4c25d94c769cb12e909e8e9086aa8eb47f381f2daddae158e3b67b44a) | The recorded demo's atomic two-recipient payout from shielded funds. | This is the public-recipient route: recipient addresses and withdrawal amounts are public. |
| [Separate-wallet private transfer](https://starkscan.co/tx/0x29a0f318bca0bca7799ebd593a8eeb0718a23ac4b0c72f163bcb112a1af7c33) | Verified Mainnet execution, plus operator-confirmed receipt in a different wallet's shielded balance/activity. | Public chain evidence alone cannot identify private recipients or prove note delivery. |
| [Recovery implementation and validation](FLOW_AUDIT.md#recovery-remediation---6-september-2026) | Durable attempts, duplicate-prevention controls and explicit recovery for uncertain outcomes. | Regression and synthetic checks are not production fault-injection certification. |
| [CSV onboarding and workspace isolation](TEAM_IMPORT.md) | Live editable CSV import with atomic validation and separate Personal/Enterprise team records. | Synthetic workflow evidence; it does not register private-transfer recipients or prove a new payment. |

The live CSV releases are KudiRoll `f5a31c9` and KudiRail `5444c33`; their deployment checkpoint is recorded in [team import validation](TEAM_IMPORT.md#production-checkpoint---6-september-2026). The uploaded video remains unchanged. Enterprise is owner-operated, with shared wallet funding; staff roles and two-person approval are not yet implemented. Bank settlement remains beta, with provider reconciliation being handled by the Paycrest team as reported by the project operator.


## Deployed product improvements - 6 September 2026

The uploaded [demo video](https://youtu.be/0Aa_1LXS-Gw) is unchanged. This note supplements it with later evidence and the current live product. Follow the [judge walkthrough](JUDGE_WALKTHROUGH.md) for a short, read-only tour.

- **Simpler navigation:** Home, Personal payroll and Enterprise are the primary destinations. Both workspaces use Overview, Team, Pay runs, Payout methods and History. Bank payout sits inside Payout methods; KudiRail docs and Business profile retain their sidebar positions.
- **Separate records:** Personal and Enterprise keep their own teams, saved pay runs and bank orders. Existing personal records retain their attribution. Wallet balance, funding and payroll controls remain shared; Enterprise does not yet provide staff roles or two-person approval.
- **Recovery and duplicate prevention:** Funding attempts persist before wallet invocation, and returned public transaction hashes are captured before server persistence. KudiRail reserves bank-order creation before contacting Paycrest and retains ambiguous attempts for recovery. Uncertain payroll outcomes require explicit recovery; a timeout does not establish that nothing was sent.

A live health check on 6 September 2026 confirmed KudiRoll `fbaa1d6` with KudiRail `d21bc63`. Navigation validation included the production build, 90 passing frontend tests, synthetic workspace-isolation checks and desktop/390px mobile browser checks. Recovery validation used temporary stores and mocked providers; it does not certify production failure recovery or bank settlement. See [navigation validation](NAVIGATION.md) and [recovery remediation](FLOW_AUDIT.md#recovery-remediation---6-september-2026).

## Additional verified evidence - 6 September 2026

### Nigerian bank payouts - beta

The onchain funding leg is verified. An independent Mainnet check confirmed that the exact USDC amount reached the assigned Paycrest order address from the STRK20 pool before expiry, in block **14,435,234**, with `SUCCEEDED` status. The latest receipt check confirmed `ACCEPTED_ON_L1`.

[View the bank-payout funding transaction on Starkscan](https://starkscan.co/tx/0x65d94624ad004db4df4c195ad0b42f407d55c3431d61321b8afae722978b114).

At the read-only provider recheck on **6 September 2026 at 09:45 UTC**, Paycrest reported **`expired`**, zero detected payment and zero returned funds for the matching order. This supersedes the 03:46 UTC observation of `initiated`. A fresh chain check still proved the exact USDC payment reached the assigned order address before expiry, in block 14,435,234, now accepted on L1. Provider deposit detection, bank delivery and refund remain unconfirmed. The mismatch requires reconciliation with Paycrest; an expired provider status does not prove that no onchain payment occurred or that funds were refunded. The project team reports that it is in discussions with Paycrest. No completion time is confirmed, and this beta evidence does not establish end-to-end bank settlement or refund certification.

### Private transfer to a separate wallet

KudiRoll subsequently completed a single-recipient private payroll test. The project operator confirmed that the recipient wallet differed from the sending C3 wallet and that receipt was confirmed in the recipient's shielded balance/activity. These wallet details and receipt confirmation are operator-reported.

The downloaded evidence records `strk20-private-transfer`, one recipient, and a finalized application status. An independent Starknet Mainnet receipt check confirmed `SUCCEEDED`, `ACCEPTED_ON_L2`, block **14,434,644**, and an event from the recorded STRK20 pool. The sanitized export's SHA-256 checksum was independently verified; recipient addresses, worker names, and payment amounts are omitted.

[View the separate-wallet transaction on Starkscan](https://starkscan.co/tx/0x29a0f318bca0bca7799ebd593a8eeb0718a23ac4b0c72f163bcb112a1af7c33).

This provides verified chain execution plus operator-confirmed delivery to a separate wallet. Public chain evidence alone cannot independently prove private recipient identity, amount, or note delivery. The checksum is not a digital signature. This test does not establish independent employee receipt, multi-recipient private payroll certification, or bank-settlement certification.

### Earlier private self-transfer

After the demo was recorded, KudiRoll exercised its fully private payroll flow on Starknet Mainnet through Ready X using a private self-transfer. The project operator confirmed that the same wallet was both sender and recipient. The downloaded payroll evidence records the `strk20-private-transfer` route and a finalized application status. An independent Mainnet receipt check confirmed `SUCCEEDED`, `ACCEPTED_ON_L2`, block **14,433,837**, and an event from the recorded STRK20 pool.

[View the transaction on Starkscan](https://starkscan.co/tx/0x045d7c467de3a94115b02f34680a19699c2da916446859b259c6fb2fe07f99e5).

The sanitized export's SHA-256 checksum was independently verified; recipient addresses, worker names, and payment amounts are omitted. The project operator reported receipt in Ready in that same wallet. This wallet observation is operator-reported: public chain evidence alone cannot independently prove private recipient identity, amount, or note delivery. The export checksum is not a digital signature.

This supplements the uploaded demo with evidence of the private self-transfer flow. Delivery to a separate recipient wallet remains untested by this transaction. It does not establish independent employee receipt, multi-recipient private payroll certification, or bank-settlement certification.
