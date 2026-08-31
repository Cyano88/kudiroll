import type { WalletWithStarknetFeatures } from '@starknet-io/get-starknet-wallet-standard/features'

export type InjectedWalletStore = {
  _refreshInjectedWallets: () => void
}

export function isConnectableStarknetWallet(value: unknown): value is WalletWithStarknetFeatures {
  const candidate = value as { features?: Record<string, { connect?: unknown }> } | null
  return typeof candidate?.features?.['standard:connect']?.connect === 'function'
}

type DiscoveryHost = {
  setInterval: (handler: () => void, timeout: number) => number
  clearInterval: (handle: number) => void
  setTimeout: (handler: () => void, timeout: number) => number
  clearTimeout: (handle: number) => void
  addEventListener: (type: 'focus' | 'pageshow', listener: () => void) => void
  removeEventListener: (type: 'focus' | 'pageshow', listener: () => void) => void
}

/**
 * Browser extensions do not all inject at the same point in page startup.
 * Retry briefly, then rescan when the user returns from installing/unlocking a wallet.
 */
export function startInjectedWalletDiscovery(store: InjectedWalletStore, host: DiscoveryHost = window) {
  const refresh = () => store._refreshInjectedWallets()
  refresh()

  const retry = host.setInterval(refresh, 500)
  const stopRetry = host.setTimeout(() => host.clearInterval(retry), 6_000)
  host.addEventListener('focus', refresh)
  host.addEventListener('pageshow', refresh)

  return () => {
    host.clearInterval(retry)
    host.clearTimeout(stopRetry)
    host.removeEventListener('focus', refresh)
    host.removeEventListener('pageshow', refresh)
  }
}
