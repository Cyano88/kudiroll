# Database cutover runbook

KudiRoll defaults to its local file stores. PostgreSQL activation is explicit and must not happen until a managed database, migration, encrypted import, backup and rollback window are ready.

## Stored data boundaries

- Authentication tables store only hashed session tokens, hashed challenge lookup keys and expiring public ceremony metadata.
- Account rows use an AES-256-GCM envelope bound to the normalized Starknet wallet address as authenticated data.
- Plaintext signer keys, viewing keys, STRK20 notes and proofs are never accepted by these stores.
- The application encryption key is required only at runtime and must never enter source control, logs, support exports or database records.

## Safe activation order

1. Provision a private managed PostgreSQL service and a least-privilege application role.
2. Configure `KUDIROLL_DATABASE_URL` and `KUDIROLL_DATA_ENCRYPTION_KEY` in the deployment secret store, leaving both backend selectors set to `file`.
3. Run `npm run db:migrate` from the reviewed release artifact.
4. Enter a maintenance window that prevents account and payroll writes.
5. Run `npm run db:import-accounts`. Import fails if the PostgreSQL account table is not empty.
6. Set `KUDIROLL_ACCOUNT_BACKEND=postgres` and `KUDIROLL_AUTH_BACKEND=postgres`, deploy one instance, and require `/api/health` to report HTTP 200, schema version 2 and both backends as PostgreSQL.
7. Test sign-in, session revocation, team reads, idempotent pay-run replay, account deletion and restart persistence before ending maintenance.
8. Take and verify a managed backup before increasing replicas.

## Rollback boundary

Before PostgreSQL accepts new writes, rollback is switching both selectors to `file`. After PostgreSQL accepts writes, switching back would restore stale file data; a tested reverse migration or database restore is required, so production activation remains blocked until that drill exists.

## Key handling

`KUDIROLL_DATA_ENCRYPTION_KEY` is exactly 32 random bytes encoded as canonical base64url. Losing it makes account records unrecoverable; rotating it requires a maintenance migration that decrypts each row with the previous key and re-encrypts it with the new key.
