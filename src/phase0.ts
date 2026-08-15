export const STARKNET_USDC = '0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'
export const KUDIROLL_MIN_SHIELD_USDC = '0.01'
import type { STRK20_ACTION, WalletAccountV6 } from 'starknet'

export const STRK20_API_VERSION = '0.10.3'
export const STARKNET_MAIN_CHAIN_ID = '0x534e5f4d41494e'

export type Strk20Wallet = Pick<WalletAccountV6, 'strk20Balances' | 'strk20PrepareInvoke' | 'strk20InvokeTransaction'>

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

export function normalizeStarknetAddress(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!isStarknetAddress(normalized)) throw new Error('Enter a valid Starknet address.')
  return normalized
}

export function supportsStrk20Api(versions: readonly string[], minimum = STRK20_API_VERSION) {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/.exec(value.trim())
    return match ? match.slice(1).map(Number) : null
  }
  const required = parse(minimum)
  if (!required) return false
  return versions.some(version => {
    const candidate = parse(version)
    if (!candidate) return false
    for (let index = 0; index < required.length; index += 1) {
      if (candidate[index] !== required[index]) return candidate[index] > required[index]
    }
    return true
  })
}

export async function withTimeout<T>(operation: Promise<T>, milliseconds: number, message = 'Wallet request timed out. Check the wallet and try again.') {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
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
    recipient: normalizeStarknetAddress(recipient),
  }
}

export function buildDepositAction(amountUsdc: string) {
  if (BigInt(toUsdcBaseUnits(amountUsdc)) < BigInt(toUsdcBaseUnits(KUDIROLL_MIN_SHIELD_USDC))) {
    throw new Error('KudiRoll shields at least 0.01 USDC. This product minimum is not a protocol fee.')
  }
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
    recipient: normalizeStarknetAddress(recipient),
  }
}

export type PrivatePayrollItem = { recipient: string; amountUsdc: string }

export async function simulatePrivatePayroll(wallet: Strk20Wallet, items: PrivatePayrollItem[]) {
  if (!items.length) throw new Error('Select at least one payroll recipient.')
  return wallet.strk20PrepareInvoke(items.map(item => buildPrivateTransferAction(item.recipient, item.amountUsdc)) as STRK20_ACTION[], true)
}

export async function submitPrivatePayroll(wallet: Strk20Wallet, items: PrivatePayrollItem[]) {
  if (!items.length) throw new Error('Select at least one payroll recipient.')
  return wallet.strk20InvokeTransaction(items.map(item => buildPrivateTransferAction(item.recipient, item.amountUsdc)) as STRK20_ACTION[])
}

export async function readPrivateUsdcBalance(wallet: Strk20Wallet) {
  return wallet.strk20Balances([STARKNET_USDC])
}

export async function simulateUsdcShield(wallet: Strk20Wallet, amountUsdc: string) {
  return wallet.strk20PrepareInvoke([buildDepositAction(amountUsdc)] as STRK20_ACTION[], true)
}

export async function submitUsdcShield(wallet: Strk20Wallet, amountUsdc: string) {
  return wallet.strk20InvokeTransaction([buildDepositAction(amountUsdc)] as STRK20_ACTION[])
}

export async function simulatePaycrestWithdraw(wallet: Strk20Wallet, recipient: string, amountUsdc: string) {
  return wallet.strk20PrepareInvoke([buildWithdrawAction(recipient, amountUsdc)] as STRK20_ACTION[], true)
}

export async function submitPaycrestWithdraw(wallet: Strk20Wallet, recipient: string, amountUsdc: string) {
  return wallet.strk20InvokeTransaction([buildWithdrawAction(recipient, amountUsdc)] as STRK20_ACTION[])
}
