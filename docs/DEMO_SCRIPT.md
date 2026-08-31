# KudiRoll hackathon demo

Target length: 2:45-3:00. Record at 1080p with browser zoom near 100%, notifications hidden, and all personal recipient information masked. Use the existing successful pay run; do not submit another Mainnet transaction for the recording.

## Shot list and narration

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00-0:18 | KudiRoll sign-in, then the signed-in Home page | "Payroll in Africa is still split between spreadsheets, public wallet transfers, and disconnected local payout providers. KudiRoll gives an organization one non-custodial payroll workspace on Starknet, with KudiRail as its durable payment and recovery layer." |
| 0:18-0:38 | Home: private USDC balance, saved teams, recent pay runs | "The organization signs with Ready X. KudiRoll never receives wallet keys, viewing keys, notes, or proofs. Teams, drafts, transaction evidence, and recovery state persist through KudiRail, so refreshing the page does not erase the workspace." |
| 0:38-0:58 | Payout methods: private payroll funds and the completed shield transaction link | "The connected Ready account funds payroll with a separate public USDC shield. After confirmation and the maturity window, that wallet balance is available inside STRK20 for payroll. KudiRoll does not custody it or operate a separate organization treasury." |
| 0:58-1:22 | Team page with recipient details masked | "A business saves a reusable team and default amounts. Payroll operators select workers and review one combined total instead of approving individual transfers." |
| 1:22-1:48 | Pay run route selector and saved successful pay run | "KudiRoll supports two routes. Pay any Starknet wallet needs no recipient setup, but recipient addresses and withdrawal amounts are public. Fully private hides recipients and amounts inside STRK20, and requires each recipient to be registered." |
| 1:48-2:14 | Successful pay-run state, then open the transaction on Starkscan | "This Mainnet pay run sent two 0.01 USDC payouts atomically in one wallet approval. The transaction succeeded at block 14,138,965, with both token transfers and five events from the canonical STRK20 pool. One failure would have reverted the whole batch." |
| 2:14-2:36 | KudiRail docs and payout lifecycle section | "KudiRail is more than a history page. It stores immutable pay-run manifests and wallet hashes, verifies Starknet receipts, blocks duplicate submissions, reconciles provider state, and exports incident evidence for support. The API remains non-custodial." |
| 2:36-2:55 | Repository README or launch evidence showing the three transaction links | "The submission includes three verified Mainnet proofs: payroll funding, an intentional settlement withdrawal, and this atomic two-recipient payroll. KudiRoll is live as an early-access product; Ready X is the current signer, while email-first embedded signing and fully private recipient certification remain clearly tracked next steps." |
| 2:55-3:00 | KudiRoll Home with product URL visible | "KudiRoll: shielded payroll funds, one-click team payments, and accountable payout infrastructure for African businesses." |

## Recording checks

- Mask names, full wallet addresses, bank details, email addresses, balances that should not be public, and browser-extension account details.
- Keep the successful transaction hash visible when showing Starkscan.
- Do not call the no-setup route fully private: its ordinary recipient addresses and amounts are public.
- Do not show or submit the unresolved Paycrest order; describe KudiRail's reconciliation capability from documentation only.
- Do not type seed phrases, OTPs, passkeys, confirmation phrases, or secrets on screen.
- Upload the final video to a public, no-login URL and place that URL in `strk20.json` under `demo_video`.
