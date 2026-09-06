# Import a team from CSV

In Personal payroll or Enterprise, open Team and select or create a team. Download the CSV template, fill it with workers, then choose the file under Import workers from CSV. The columns are `name`, `walletAddress`, and `defaultAmountUsdc`; their order may vary. Files may contain up to 100 workers and 24 KB. Use decimal USDC amounts with at most six decimal places.

Review and edit names, addresses and amounts in the preview. Remove unwanted rows or cancel the import. Invalid rows and duplicate wallets must be corrected before saving. Leading zeros and letter case do not make a wallet a different recipient. Wallet syntax checks do not establish ownership or private-transfer registration.

Save adds all rows to the selected team's workspace in one account transaction. Validation failure adds none. The same wallet may belong to different teams, but may appear only once in each team. Existing legacy duplicates are not deleted or merged automatically. If the response is interrupted, refresh the team before retrying; the server checks saved workers again and rejects duplicates.

The file is parsed locally for preview. Saving sends the reviewed rows through the authenticated account API and existing encrypted account store. No wallet transaction is created. Importing does not register recipients for private transfers.

## Validation

Full suites passed at 94 frontend and 76 backend tests, followed by passing added import HTTP tests in both repositories (95 and 77 total). Tests cover malformed CSV, quoted fields, canonical wallet identity, bounds and amounts, atomic rejection, concurrent duplicate imports, team/account isolation, and unauthenticated or stale-account requests. Both builds passed. Synthetic browser checks covered duplicate rejection, editing an address and saving two workers; mobile content fit the 390px viewport. No real account records or payments were changed during verification.

## Production checkpoint - 6 September 2026

Backend `5444c33` and frontend `f5a31c9` are deployed. The live health endpoint confirmed both release identifiers at approximately 18:06 UTC. The backend import endpoint returned 401 without a session. The live read-only demo Team screen rendered the CSV template and upload section with mutations disabled and no browser console errors. Authenticated editing, saving and workspace isolation were checked with synthetic accounts before deployment; no production worker records were created during the release check.
