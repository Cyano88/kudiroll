# Evidence audit - 2026-09-05

Scope: recovered payroll evidence exports in KudiRoll and standalone KudiRail, Paycrest timing evidence, download integration, and dependency advisories. Changes are local; no deployment or Mainnet execution is claimed.

## Findings resolved

- Pool verification was inferred from descriptive text and the current configuration. It now requires a stored verified pool address, transaction hash, finalized status, and accepted block number. A configuration change does not rewrite the historical verified address; legacy records need another onchain check.
- Successful-looking pool events without an accepted receipt could finalize payroll. Both payroll verification and bank reconciliation now require a successful receipt accepted on L1/L2 with a block number.
- A temporary RPC failure could remove existing payment evidence. Receipt outages preserve it, and same-block successful rechecks retain known timestamps when block lookup is unavailable. Timing uses a matching block number and never implies bank settlement.
- The KudiRoll proxy discarded attachment headers. Evidence downloads now preserve content disposition and no-store semantics through the proxy.
- The payroll exporter bypassed the configured API origin. It now uses the shared origin resolver.
- Responsive styles hid evidence actions below 980px. Payroll actions are visible with 44px touch targets; finalized runs can be rechecked from History.
- Both dependency trees contained vulnerable qs versions. An exact qs 6.16.0 override resolves the advisories while retaining the existing Express major. Revisit the override when upstream dependency ranges include the fixed release. Reference: https://github.com/advisories/GHSA-4mjr-xmp4-gh2g

## Verification

- KudiRail: 65 tests pass; TypeScript build/typecheck passes.
- KudiRoll: 83 tests pass; production TypeScript/Vite build passes after the final UI changes.
- Both clean npm installations pass; dependency audits report zero vulnerabilities.
- Regression coverage includes tenant isolation, unauthenticated denial, omitted private fields, route labels, legacy records, recorded-vs-current pool addresses, unaccepted receipts, invalid/missing timing, RPC outages, and proxy attachment behavior.
- Browser: real built frontend, real KudiRoll proxy, and real KudiRail account/evidence routers with isolated synthetic file stores. Edge successfully downloaded private evidence at desktop width and compatibility evidence at 390px. The private JSON excludes synthetic team/worker names, recipient address, and amount; it reports intent-only evidence for a draft. Mobile export controls are visible and clickable; the page has no horizontal overflow. Browser console reports zero errors or warnings.
- Chrome automation exited before navigation; Edge completed the browser check. No wallet was connected.
- Build retains an existing eval warning from @module-federation/sdk. This is not an npm advisory or evidence of a tested wallet connection.

## Remaining external evidence

Deployment, a real Ready private-transfer recipient confirmation, provider settlement certification, and a design-partner commitment remain separate pending steps. Use PAYROLL_EVIDENCE.md for the controlled wallet and Paycrest checklist. The application policy remains an application control, not an organization smart-account restriction. No viewing keys, notes, proofs, real bank records, or credentials were used for this audit.
