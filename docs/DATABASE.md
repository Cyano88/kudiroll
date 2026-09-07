# Database operations and cutover runbook

Production KudiRail already uses PostgreSQL for accounts and authentication. The September 6, 2026 health audit confirmed schema 2 and database reachability. Local defaults may still use file stores. The activation steps below apply to a new environment; do not replay an initial import against the live database.

The [isolated PostgreSQL restore drill passed](https://github.com/Cyano88/kudirail/actions/runs/34059444795) with synthetic account and authentication records. Managed production snapshot recovery, backup retention and key rotation remain unverified. See the backend [drill scope and operational follow-up](https://github.com/Cyano88/kudirail/blob/main/docs/RESTORE_DRILL.md).

## Stored data boundaries

- Authentication tables store only hashed session tokens, hashed challenge lookup keys and expiring public ceremony metadata.
- Account rows use an AES-256-GCM envelope bound to the normalized Starknet wallet address as authenticated data.
- Plaintext signer keys, viewing keys, STRK20 notes and proofs are never accepted by these stores.
- The application encryption key is required only at runtime and must never enter source control, logs, support exports or database records.

## New-environment activation order

1. Provision a private managed PostgreSQL service and a least-privilege application role.
2. Configure `KUDIROLL_DATABASE_URL` and `KUDIROLL_DATA_ENCRYPTION_KEY` in the deployment secret store, leaving both backend selectors set to `file`.
3. Run `npm run db:migrate` from the reviewed release artifact.
4. Enter a maintenance window that prevents account and payroll writes.
5. Run `npm run db:import-accounts`. Import fails if the PostgreSQL account table is not empty.
6. Set `KUDIROLL_ACCOUNT_BACKEND=postgres` and `KUDIROLL_AUTH_BACKEND=postgres`, deploy one instance, and require `/api/health` to report HTTP 200, schema version 2 and both backends as PostgreSQL.
7. Test sign-in, session revocation, team reads, idempotent pay-run replay, account deletion and restart persistence before ending maintenance.
8. Take and verify a managed backup before increasing replicas.

## Rollback boundary

Before PostgreSQL accepts new writes, rollback is switching both selectors to `file`. After PostgreSQL accepts writes, switching back would restore stale file data; a tested reverse migration or database restore is required, and no safe reverse migration has been certified. A code rollback must remain compatible with the current database schema; successful health checks alone do not prove data rollback safety.

## Key handling

`KUDIROLL_DATA_ENCRYPTION_KEY` is exactly 32 random bytes encoded as canonical base64url. Losing it makes account records unrecoverable; rotating it requires a maintenance migration that decrypts each row with the previous key and re-encrypts it with the new key.

## Managed recovery acceptance

Verify the backup schedule and retention, then restore a managed snapshot into an isolated environment with payments and customer notifications disabled. Supply the matching encryption key through the secret store. Check account integrity, revoke restored sessions, and reconcile chain/provider outcomes before allowing retries: a backup can predate an actual payment. Record recovery duration and the data-loss window. The synthetic CI drill does not certify these managed recovery steps.

## September 7 manual recovery verification

An encrypted production logical export and isolated local restore passed, including snapshot table fingerprints, account decryption and restored session/challenge revocation. The disposable restored database was removed. Managed snapshots/PITR require the Pro plan and remain disabled; the current no-upgrade path is [manual encrypted backups](https://github.com/Cyano88/kudirail/blob/main/docs/MANUAL_BACKUP.md) before releases. The retained local archive uses a Windows-account-bound DPAPI recovery key; independent-copy/key-escrow recovery remains pending. This does not authorize restoring the live database or switching it to file storage.
