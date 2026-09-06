# Submission note

## Additional verified evidence - 6 September 2026

### Nigerian bank payouts - beta

The onchain funding leg is verified. An independent Mainnet check confirmed that the exact USDC amount reached the assigned Paycrest order address from the STRK20 pool before expiry, in block **14,435,234**, with `SUCCEEDED` / `ACCEPTED_ON_L2` status.

[View the bank-payout funding transaction on Starkscan](https://starkscan.co/tx/0x65d94624ad004db4df4c195ad0b42f407d55c3431d61321b8afae722978b114).

At the provider check on 6 September 2026 at 03:46 UTC, Paycrest still reported `initiated`, zero detected payment, and zero returned funds. Deposit detection and bank delivery are not yet confirmed. Payments may be delayed while this detection issue is unresolved; no completion time is confirmed. The project team reports that it is in discussions with Paycrest to resolve detection. This beta status does not establish end-to-end bank settlement or refund certification.

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
