# Payroll evidence verification

Status: local implementation and synthetic browser export verified; see EVIDENCE_AUDIT.md. Wallet delivery, deployment, and provider settlement remain unverified.

## Review without moving funds

1. In an authenticated KudiRoll workspace, open History and choose Export evidence on an existing pay run. The API is `GET /api/v1/pay-runs/:payRunId/evidence`; production uses standalone KudiRail and local fallback uses the mirrored KudiRoll router.
2. A draft must report intent evidence only. A submitted hash without configured-pool finality must remain unverified. A public-wallet run must be labelled `strk20-public-withdrawal`.
3. Check that the JSON excludes team and worker names, recipient addresses, individual amounts, and the total. Transaction hashes link to public chain data; exported metadata is deliberately disclosed.
4. The checksum detects changes to the serialized payload; it is unsigned. Audit-chain verification is performed by the server before redaction. The exported subset is not a complete independently verifiable audit chain.
5. Record application release, run identifier, export time, and review outcome. Keep any private business records outside the repository.

## Fully private delivery certification - pending

Before a new Mainnet transaction, confirm whether late evidence is accepted and obtain the owner's approval for the exact recipients and amount. This checklist does not authorize a transaction.

1. Use the existing Ready wallet flow with registered private-transfer recipients. Keep viewing keys, notes, proofs, and recovery material inside their wallets.
2. Use previously funded, mature private USDC. Public funding must be documented separately; depositing alongside the payment can expose timing and amount correlations.
3. Create a team pay run, explicitly select Fully private, and review its recipients and amounts privately. Simulate the complete batch and inspect Ready's requested actions and current fees.
4. After approval, submit once. Preserve the returned transaction hash. If the outcome is unknown, use the existing recovery flow before any retry.
5. Verify finality through KudiRoll and export the evidence. Pool interaction establishes neither the identity of private recipients nor receipt of their notes.
6. Each recipient independently confirms receipt through their own wallet. Record a consented, sanitized confirmation without exporting wallet internals or unrelated balances.
7. Only then describe end-to-end private delivery as verified. A successful pool receipt alone is insufficient; the transaction sender must not be assumed to be the employer.

Wallet route reference: https://strk20-by-example.org/starknet-wallet-api/overview

## Paycrest incident package - separate support disclosure

KudiRail's authenticated bank-payout export includes the order reference, assigned settlement address, amount, immutable transaction hash, provider status, accepted block and timestamp, and order expiry. Unlike the payroll export, it contains recipient/support information: review it privately before sending to Paycrest.

`paidBeforeExpiry` is true or false only when the exact pool-to-order USDC transfer is proved and an accepted block timestamp is available. Reverted or unmatched receipts, missing timestamps, and block-provider failures leave timing unknown. This flag is not proof of bank settlement.

Ask Paycrest to confirm deposit detection, STRK20-origin transfer indexing, attribution/refund/settlement of the existing order, and readiness for capped canaries. Do not send another payment to diagnose an unresolved order. No support message has been sent by this implementation.

## Enterprise evidence still required

A prospective design partner should review the product and explicitly agree to a capped pilot, named administrator, wallet-approval responsibility, supported recipient setup, and bank-settlement gate. No pilot commitment or provider certification is established by these code changes. Payroll policy enforcement remains at the application boundary.
