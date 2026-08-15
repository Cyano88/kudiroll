export const STARKNET_USDC = '0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'
export const STRK20_API_VERSION = '0.10.3'
export const STARKNET_MAIN_CHAIN_ID = '0x534e5f4d41494e'

export type WalletRequest = (request: { type: string; params?: unknown }) => Promise<unknown>

export type Strk20Balance = {
  token: string
  balance: string
}

export function isStarknetMainnet(value: unknown) {
  if (typeof value === 'string' && value.trim().toUpperCase() === 'SN_MAIN') return true
  try {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return false
    return BigInt(value) === BigInt(STARKNET_MAIN_CHAIN_ID)
  } catch {
    return false
  }
}

export function requireStarknetMainnet(value: unknown) {
  if (!isStarknetMainnet(value)) {
    throw new Error('KudiRoll currently supports Starknet Mainnet only. Switch your wallet to Mainnet and reconnect.')
  }
}

export function isStarknetAddress(value: string) {
  return /^0x[0-9a-fA-F]{1,64}$/.test(value.trim())
}

export function toUsdcBaseUnits(value: string) {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) throw new Error('Enter a positive USDC amount with at most 6 decimals.')
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n) throw new Error('Amount must be greater than zero.')
  return `0x${units.toString(16)}`
}

export function buildWithdrawAction(recipient: string, amountUsdc: string) {
  if (!isStarknetAddress(recipient)) throw new Error('Paycrest must return a valid Starknet recipient address.')
  return {
    type: 'withdraw' as const,
    token: STARKNET_USDC,
    amount: toUsdcBaseUnits(amountUsdc),
    recipient: recipient.trim(),
  }
}

export function buildDepositAction(amountUsdc: string) {
  return {
    type: 'deposit' as const,
    token: STARKNET_USDC,
    amount: toUsdcBaseUnits(amountUsdc),
  }
}

export function buildPrivateTransferAction(recipient: string, amountUsdc: string) {
  if (!isStarknetAddress(recipient)) throw new Error('Every private payroll recipient must have a valid Starknet address.')
  return {
    type: 'transfer' as const,
    token: STARKNET_USDC,
    amount: toUsdcBaseUnits(amountUsdc),
    recipient: recipient.trim(),
  }
}

export type PrivatePayrollItem = { recipient: string; amountUsdc: string }

export async function simulatePrivatePayroll(request: WalletRequest, items: PrivatePayrollItem[]) {
  if (!items.length) throw new Error('Select at least one payroll recipient.')
  return request({
    type: 'wallet_strk20PrepareInvoke',
    params: { actions: items.map(item => buildPrivateTransferAction(item.recipient, item.amountUsdc)), simulate: true, api_version: STRK20_API_VERSION },
  })
}

export async function submitPrivatePayroll(request: WalletRequest, items: PrivatePayrollItem[]) {
  if (!items.length) throw new Error('Select at least one payroll recipient.')
  return request({
    type: 'wallet_strk20InvokeTransaction',
    params: { actions: items.map(item => buildPrivateTransferAction(item.recipient, item.amountUsdc)), api_version: STRK20_API_VERSION },
  })
}

export async function supportedWalletApi(request: WalletRequest) {
  const result = await request({ type: 'wallet_supportedWalletApi' })
  return Array.isArray(result) ? result.map(String) : []
}

export async function readPrivateUsdcBalance(request: WalletRequest) {
  const result = await request({
    type: 'wallet_strk20Balances',
    params: { tokens: [STARKNET_USDC], api_version: STRK20_API_VERSION },
  })
  return (Array.isArray(result) ? result : []) as Strk20Balance[]
}

export async function submitUsdcShield(request: WalletRequest, amountUsdc: string) {
  return request({
    type: 'wallet_strk20InvokeTransaction',
    params: {
      actions: [buildDepositAction(amountUsdc)],
      api_version: STRK20_API_VERSION,
    },
  })
}

export async function simulatePaycrestWithdraw(request: WalletRequest, recipient: string, amountUsdc: string) {
  return request({
    type: 'wallet_strk20PrepareInvoke',
    params: {
      actions: [buildWithdrawAction(recipient, amountUsdc)],
      simulate: true,
      api_version: STRK20_API_VERSION,
    },
  })
}

export async function submitPaycrestWithdraw(request: WalletRequest, recipient: string, amountUsdc: string) {
  return request({
    type: 'wallet_strk20InvokeTransaction',
    params: {
      actions: [buildWithdrawAction(recipient, amountUsdc)],
      api_version: STRK20_API_VERSION,
    },
  })
}
