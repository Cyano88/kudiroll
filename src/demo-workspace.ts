import type { TreasuryReadiness } from './treasury-readiness'

export const DEMO_PAYROLL_HASH = '0x6d75bc4c25d94c769cb12e909e8e9086aa8eb47f381f2daddae158e3b67b44a'
export const DEMO_SHIELD_HASH = '0x7aa7d78827c66c92db23e7864cc3cc01c23eb28955462ac2b458ce750faa76c'
export const DEMO_PAYOUT_HASH = '0x55b6551094333c8d98bbc0560b9569afb11d3951c51c8a47fd8ec7307c068d9'
const DEMO_NOW = '2026-08-31T09:00:00.000Z'

export const demoAccount = {
  walletAddress: '0x04d3e7b8a14130d9b7c30ea4c0a85b065480574655649f0c9a3e5831fbd7c3',
  profile: { ownerName: 'Amina Bello', businessName: 'Northstar Operations', jobTitle: 'Finance lead', email: 'finance@northstar.example', phone: '', emailVerifiedAt: '2026-08-27T10:00:00.000Z', updatedAt: '2026-08-27T10:00:00.000Z' },
  payrollPolicy: { version: 4, reserveUsdc: '0.25', maxPayRunUsdc: '5', payoutsPaused: false, updatedAt: '2026-08-30T13:30:00.000Z' },
  teams: [{
    id: 'demo-team-operations', name: 'Operations team', description: 'Monthly operations payroll', createdAt: '2026-08-20T08:00:00.000Z', updatedAt: '2026-08-29T08:00:00.000Z',
    workers: [
      { id: 'demo-worker-ada', name: 'Ada Okafor', walletAddress: '0x02914d731b3e95089c6bc7d93e4ad95b8d69f3f3a8c7d9b31541d59e17f4132', defaultAmountUsdc: '0.01', createdAt: DEMO_NOW, updatedAt: DEMO_NOW },
      { id: 'demo-worker-james', name: 'James Ajayi', walletAddress: '0x017ae2df531f39ad5f15635ef8a943ae103de05bd40731cf6de8441a50fec1f', defaultAmountUsdc: '0.01', createdAt: DEMO_NOW, updatedAt: DEMO_NOW },
    ],
  }],
  payRuns: [{
    id: 'demo-pay-run-001', teamId: 'demo-team-operations', teamName: 'Operations team', settlementMode: 'public-wallet', status: 'finalized', totalUsdc: '0.02',
    items: [
      { id: 'demo-pay-item-ada', workerId: 'demo-worker-ada', workerName: 'Ada Okafor', walletAddress: '0x02914d731b3e95089c6bc7d93e4ad95b8d69f3f3a8c7d9b31541d59e17f4132', amountUsdc: '0.01', status: 'submitted' },
      { id: 'demo-pay-item-james', workerId: 'demo-worker-james', workerName: 'James Ajayi', walletAddress: '0x017ae2df531f39ad5f15635ef8a943ae103de05bd40731cf6de8441a50fec1f', amountUsdc: '0.01', status: 'submitted' },
    ],
    transactionHash: DEMO_PAYROLL_HASH, submissionAttemptedAt: '2026-08-30T15:03:00.000Z', finalityCheckedAt: '2026-08-30T15:05:00.000Z', acceptedBlockNumber: 3420201, finalityMessage: 'Accepted on Starknet and matched to the saved payroll intent.', createdAt: '2026-08-30T15:00:00.000Z', updatedAt: '2026-08-30T15:05:00.000Z',
  }],
  bankPayouts: [],
  treasuryShields: [{ transactionHash: DEMO_SHIELD_HASH, amountUsdc: '0.01', submittedAt: '2026-08-30T12:00:00.000Z' }],
  treasuryAudit: [
    { id: 'demo-audit-1', type: 'treasury-shield.recorded', subjectId: DEMO_SHIELD_HASH, summary: 'Recorded 0.01 USDC payroll funding.', createdAt: '2026-08-30T12:00:00.000Z', previousHash: '', eventHash: '0x9c82a17df126bd5e' },
    { id: 'demo-audit-2', type: 'payroll-policy.updated', subjectId: '4', summary: 'Set reserve 0.25 USDC, maximum 5 USDC, payouts active.', createdAt: '2026-08-30T13:30:00.000Z', previousHash: '0x9c82a17df126bd5e', eventHash: '0xb846d2ac091e753f' },
    { id: 'demo-audit-3', type: 'pay-run.finalized', subjectId: 'demo-pay-run-001', summary: `Finalized payroll transaction ${DEMO_PAYROLL_HASH}.`, createdAt: '2026-08-30T15:05:00.000Z', previousHash: '0xb846d2ac091e753f', eventHash: '0xc7ae13270f49d684' },
  ],
  passkeys: [], recoveryReady: false, encryptedWalletBackup: null, treasuryAuditVerified: true,
  createdAt: '2026-08-20T08:00:00.000Z', updatedAt: '2026-08-30T15:05:00.000Z',
}

export const demoPayouts = [{
  id: 'demo-paycrest-order', reference: 'KUDIRAIL-DEMO', amountNgn: '800', amountUsdc: '0.585222', receiveAddress: '0x03d0demo', validUntil: '2026-08-30T12:00:00.000Z', accountName: 'Verified demo recipient', bankLast4: '9696', network: 'Starknet', token: 'USDC', providerStatus: 'initiated', displayStatus: 'reconciliation-required', transactionHash: DEMO_PAYOUT_HASH, submissionState: 'submitted', chainStatus: 'succeeded', chainMessage: 'Starknet payment verified.', reconciliationReason: 'Awaiting provider confirmation for the Starknet settlement route.', createdAt: '2026-08-30T11:45:00.000Z', updatedAt: '2026-08-30T12:05:00.000Z',
}]

export const demoTreasuryReadiness: TreasuryReadiness = {
  status: 'ready', shield: demoAccount.treasuryShields[0], acceptedBlockNumber: 3420100, currentBlockNumber: 3420120, confirmations: 20, blocksRemaining: 0, checkedAt: DEMO_NOW,
  message: 'Shield confirmed and mature. Its private note is ready for payroll.',
}

export function isPublicDemoPath(pathname: string) {
  return pathname.replace(/\/+$/, '') === '/demo'
}
