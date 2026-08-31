# Starknet integration

KudiRoll is a non-custodial Starknet application. It uses a connected wallet for authentication and approval; the server never receives wallet keys or privacy material.

## Integration surface

| Layer | Current implementation | Public contract |
| --- | --- | --- |
| Wallet discovery | `@starknet-io/get-starknet` | Compatible injected Starknet wallets can open a KudiRoll account. |
| Authentication | Starknet typed-data challenge | The server verifies a five-minute, single-use challenge on Starknet Mainnet and issues a 12-hour HTTP-only session. |
| Network safety | `SN_MAIN` gate | A wallet on any other chain is rejected before sign-in or payment actions. |
| Payroll | Ready X STRK20 Wallet API `0.10.3` | A pay run becomes one ordered action list, is simulated, explicitly confirmed, and submitted once. No-setup withdrawals pay ordinary Starknet wallets with public recipients and amounts; fully private transfers require registered recipients. |
| Treasury readiness | Starknet.js RPC receipt + latest block | KudiRoll tracks only the public shield hash and blocks a newly funded payroll until 10 blocks after acceptance. |
| Settlement pilot | Paycrest Starknet USDC to NGN | Kept separate from payroll and disabled by default for new live orders. |
| Chain reads | Starknet.js RPC provider | Production must use a dedicated Mainnet RPC URL. |

The STRK20 methods are a privacy-wallet capability, not a general Starknet wallet guarantee. General Starknet wallets can authenticate and manage workspace data even when the optional capability probe is unsupported; private balance and payroll execution remain gated on the compatible STRK20 API.

## Mainnet invariants

- Chain ID: `SN_MAIN` (`0x534e5f4d41494e`).
- Private-USDC token: `0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb`.
- Wallet API target: `0.10.3`.
- Pool fees are wallet-calculated at runtime and shown during approval; no fixed fee is encoded in KudiRoll.
- The 0.01 USDC shield floor is a KudiRoll product minimum, not a protocol fee.
- Paycrest order creation is off unless `PHASE0_LIVE_ORDER_ENABLED=true` is explicitly configured.

Do not add Sepolia as a display-only switch. It requires a verified test token, a compatible STRK20 deployment, chain-aware typed data, and separate certification evidence.

## Ecosystem-ready evidence

Before asking wallets, infrastructure providers, or Starknet ecosystem channels to list or amplify KudiRoll, publish:

1. A stable HTTPS application URL and public source repository.
2. A short architecture diagram and non-custodial data-flow explanation.
3. A successful multi-recipient transaction reference produced by the supported privacy wallet, with its privacy boundary stated accurately.
4. A compatibility table separating standard Starknet account access from Ready-specific private actions.
5. Security, privacy, incident-contact, and responsible-disclosure pages.
6. Reproducible CI results and an explicit license.

## Next integration steps

1. Certify the fully private mode with two or more registered recipients in one Ready X action list on Mainnet using the smallest safe amounts.
2. Record the wallet version, chain ID, recipient count, simulation outcome, transaction hash, and final status without recording private payroll identities.
3. Complete managed backup/restore, encryption-key rotation, and multi-device recovery drills for the deployed API.
4. Run wallet compatibility tests for sign-in separately from STRK20 payroll capability tests.
5. Record and publish the sanitized three-minute ecosystem demo.
