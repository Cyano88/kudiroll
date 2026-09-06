# Public launch readiness

KudiRoll remains a public alpha. This September 6, 2026 audit separates shipped behavior from operational certification still needed before wider production use.

## Verified baseline

- Personal payroll and Enterprise have separate teams, pay runs and history; funding and wallet controls are shared. Enterprise does not yet provide shared staff access or two-person approval.
- KudiRail uses encrypted PostgreSQL account storage and durable hashed authentication sessions. Public health reports schema 2 and a reachable database.
- Verified runtime releases: KudiRoll `6491e5bcc39d2432a83e4709b94d48f782f0f1fb`; KudiRail `5444c333414bf721a671268797740656f38dd8e1`. Later documentation and CI commits do not change deployed runtime code.
- Both repositories have passing CI. Both production dependency audits reported zero known vulnerabilities on September 6; this does not replace security review.
- The [replacement demo](https://youtu.be/v0-Z7-jrWuE) is published in the submission metadata and documentation. YouTube metadata availability was checked; this audit did not review the video contents.
- Five transaction references are listed in `strk20.json`. Their route-specific claims and operator evidence are described in [SUBMISSION_NOTE.md](SUBMISSION_NOTE.md) and [PAYROLL_EVIDENCE.md](PAYROLL_EVIDENCE.md).
- The [isolated PostgreSQL restore drill passed](https://github.com/Cyano88/kudirail/actions/runs/34059444795): migrations, encrypted accounts, Personal/Enterprise records, synthetic transaction history, recovery attempts, session revocation and tenant isolation survived a logical dump and restore.

## Remaining release gates

| Gate | Current state | Next evidence |
| --- | --- | --- |
| Managed backup and recovery | Isolated logical restore passed; production snapshot recovery unverified | Verify backup schedule and retention, restore a managed snapshot into isolation, measure recovery time/data loss, and reconcile payment state before retries. |
| Encryption-key recovery and rotation | Encrypted storage is live; operational drills unverified | Demonstrate secure recovery of the matching key and a maintenance rotation with rollback. |
| Account recovery | Durable sessions and recovery controls are implemented | Complete a two-device passkey/recovery exercise and verify revocation. Email delivery requires separate end-to-end certification. |
| Scaling | Per-process rate limits | Keep one KudiRail replica until distributed rate limiting is implemented and verified. |
| Security and operations | Application controls and dependency checks exist | Complete external threat review, incident-response exercise, and verify monitoring/alert delivery and retention/deletion procedures. |
| Paycrest | Bank route is beta; provider reconciliation is being handled separately | Certify deposit detection, bank delivery, expiry/refund and recovery. An onchain settlement transfer alone does not certify NGN delivery. |
| Private payroll | Published transaction and operator evidence exists | Preserve the exact recipient-count and delivery scope of each proof; do not infer a new multi-recipient private certification from the public-recipient atomic batch. |

## Next operational sequence

1. Verify the managed database backup schedule, retention and latest successful snapshot.
2. Restore a snapshot into a separate environment with outbound payments and customer notifications disabled. Keep customer data and encryption keys out of public logs and artifacts.
3. Check account integrity, revoke restored sessions, and reconcile transaction/provider outcomes before enabling retries. Record recovery time and the snapshot's data-loss window.
4. Complete key recovery/rotation and two-device account recovery exercises.
5. Run a capped, invited-business pilot with monitored support and reconciliation outcomes before expanding access.

A healthy release and the ability to redeploy older code do not establish safe data rollback. Never switch a populated PostgreSQL deployment back to an older file store. See [DATABASE.md](DATABASE.md) for the rollback boundary and the backend [restore drill](https://github.com/Cyano88/kudirail/blob/main/docs/RESTORE_DRILL.md) for coverage and limitations.

Paycrest remains under the existing beta arrangement while the provider team works on reconciliation. This audit did not change route availability or submit payments.
