# KudiRoll Rail API

KudiRoll Rail is the non-custodial payroll orchestration boundary behind the KudiRoll application. Version 1 creates immutable private-payroll intents and returns deterministic execution manifests; it does not hold wallet keys, viewing keys, notes, proofs, bank details, or signing authority.

## Current release boundary

- Base path: `/api/v1`
- Network: Starknet Mainnet
- Authentication: first-party KudiRoll session cookie only
- First-party cross-origin transport: implemented behind exact `KUDIRAIL_ALLOWED_ORIGINS`; set KudiRoll App's `VITE_KUDIRAIL_API_URL` to the HTTPS API origin
- External API keys, OAuth clients, webhooks and third-party developer access: not released
- Local settlement: NGN remains a separately gated Paycrest guided test and is not part of the private batch manifest

`GET /api/v1` returns the live capability declaration. Do not infer unavailable corridors or external developer access from this document.

## Create a pay-run intent

`POST /api/v1/pay-runs` requires an authenticated KudiRoll session and an `Idempotency-Key` header containing 16–128 safe characters.

```json
{
  teamId: saved-team-id,
  clientReference: optional-client-reference,
  items: [
    { workerId: saved-worker-id, amountUsdc: 25.00 }
  ]
}
```

The response contains the immutable pay-run snapshot and an `executionManifest`. Only the client may translate that manifest into STRK20 wallet calls and request user approval.

## Execution manifest

`GET /api/v1/pay-runs/:payRunId/execution-manifest` returns the same deterministic recipient/amount action list and snapshot hash. Worker names are deliberately excluded.

The manifest is an application intent, not a signed Starknet transaction, proof, authorization, or promise of settlement. KudiRoll Rail cannot submit it.

## Lifecycle updates

`PATCH /api/v1/pay-runs/:payRunId` accepts the guarded lifecycle transitions used by the reference application. `POST /api/v1/pay-runs/:payRunId/verify` verifies the saved transaction receipt against the configured STRK20 pool, while `POST /api/v1/pay-runs/:payRunId/resolve-unknown` requires a fresh passkey session and the explicit recovery confirmation.

The framework-neutral client in `src/rail/client.ts` owns these paths for KudiRoll App and future extracted clients. Legacy `/api/account/pay-runs/*` routes remain temporarily available for rollback, not as the developer contract.

## Planned production developer surface

External access will not be enabled until tenant-scoped credentials, managed PostgreSQL, database-enforced idempotency, signed webhooks, rate limits, revocation, audit logs, CORS policy and backup/restore tests are complete.

The first-party application may run on a separate origin, but its request transport always includes API-hosted secure cookies and KudiRail accepts only explicitly allowlisted origins. Production app and API domains must remain same-site for the current `SameSite=Strict` session design; unrelated third-party origins require the future scoped-credential flow instead of weakening cookies.

KudiRoll production uses a same-origin gateway when `KUDIRAIL_UPSTREAM_URL` is configured. The browser continues calling KudiRoll paths, while the gateway forwards only `/api/account`, `/api/v1` and `/api/phase0` to KudiRail; it never forwards an `Authorization` header and never handles wallet signatures, viewing keys, notes or proofs. Removing the variable restores the bundled backend during the cutover window.
