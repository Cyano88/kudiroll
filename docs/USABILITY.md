# Payment flow usability

Authenticated users can save a valid Personal or Enterprise pay-run draft without connecting Ready or sharing a private balance. Existing server policy and unresolved-payment checks still apply. Draft saving never opens the wallet or submits a payment.

The saved review has a separate Prepare payment in Ready action. Preparation requires a compatible wallet, ready funding and a checked balance. Approval identifies the connected wallet owner and still rechecks current balance and reviewed controls before wallet invocation. Enterprise does not provide staff roles or two-person approval.

Insufficient total balance and a protected-reserve restriction have separate messages. A zero reserve is never described as the reason for a balance shortage. Payroll controls are labeled shared across both workspaces, with zero explicitly meaning no reserve or no cap.

Funding uses Amount to add, one mature-funding status, and a transaction link. Enforcement details are available in expandable help. Native browser alerts, confirmations and prompts have been replaced with app messages, named deletion confirmations and labeled recovery forms. Cancel or Escape cancels a dialog; session or workspace unmount cancels its pending requests. Existing recovery phrases and server authentication remain required.

Validation: production build and 97 tests passed, including balance-shortage and reserve-boundary tests. Synthetic browser checks saved an Enterprise draft without a wallet or balance and reopened its unchanged snapshot from History. No wallet transaction was created.

Further browser validation: Escape canceled team deletion; confirming deletion removed the synthetic team and kept both drafts in History. The funding recovery form displayed its labeled hash input at 390px width, and Cancel retained the pending attempt. No native browser dialogs appeared in these flows.

Production checkpoint: KudiRoll `6491e5b` is live and healthy with KudiRail `5444c33`, verified on 6 September 2026 at approximately 19:01 UTC. A final synthetic Personal payroll check also saved a draft without Ready or a checked balance. Both tested browser sessions reported zero console errors.
