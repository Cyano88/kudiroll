# Workspace navigation

Primary navigation: Home, Personal payroll, Enterprise. KudiRail docs and Business profile retain their desktop sidebar positions. Mobile shows the same three destinations plus More for Business profile.

Home is the entry page: two workspace cards, record counts, and links to payments requiring attention. It does not repeat a payroll dashboard. Both workspaces have the same tabs: Overview, Team, Pay runs, Payout methods, History. Bank payout is a child of Payout methods, with a return action. The current workspace and page remain visible. Tab changes return to the top of the page.

Personal payroll uses existing `standard` and untagged records; Enterprise uses `enterprise`. No migration or backend change is required. Team creation, saved runs, recovered manifests and bank order creation retain their existing workspace attribution. Switching primary destinations resets the local composer; saved drafts remain resumable in their workspace History. Account-wide payment safety blocks still apply across both workspaces.

Shared wallet balance, funding, funding history and payroll controls are labelled as shared and live in Payout methods. Each workspace History contains only its own pay runs, payroll audit events and bank orders. Enterprise remains owner-operated and private-USDC-only; the bank route retains its beta and public-settlement disclosure.

Validation: production build and all 90 KudiRoll tests passed. Synthetic browser checks covered Home attention links into Personal payroll History, distinct personal/Enterprise records, matching tabs, Enterprise saved-run recovery, funding history placement, and Bank payout within its workspace. Desktop and 390px mobile layouts were inspected; mobile content width matched the viewport. No wallet was connected and no funds moved.
