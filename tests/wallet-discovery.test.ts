import assert from 'node:assert/strict'
import test from 'node:test'
import { isConnectableStarknetWallet, startInjectedWalletDiscovery } from '../src/wallet-discovery'

test('rejects stale wallet entries without a Wallet Standard connect feature', () => {
  assert.equal(isConnectableStarknetWallet({ name: 'Ready X' }), false)
  assert.equal(isConnectableStarknetWallet({ name: 'Ready X', features: {} }), false)
  assert.equal(isConnectableStarknetWallet({ name: 'Ready X', features: { 'standard:connect': { connect() {} } } }), true)
})

test('rescans delayed injected wallets and refreshes when the browser regains focus', () => {
  let refreshes = 0
  let nextTimer = 1
  const intervals = new Map<number, () => void>()
  const timeouts = new Map<number, () => void>()
  const listeners = new Map<string, () => void>()
  const host = {
    setInterval(handler: () => void) { const id = nextTimer++; intervals.set(id, handler); return id },
    clearInterval(id: number) { intervals.delete(id) },
    setTimeout(handler: () => void) { const id = nextTimer++; timeouts.set(id, handler); return id },
    clearTimeout(id: number) { timeouts.delete(id) },
    addEventListener(type: 'focus' | 'pageshow', listener: () => void) { listeners.set(type, listener) },
    removeEventListener(type: 'focus' | 'pageshow') { listeners.delete(type) },
  }

  const stop = startInjectedWalletDiscovery({ _refreshInjectedWallets: () => { refreshes += 1 } }, host)
  assert.equal(refreshes, 1)
  intervals.values().next().value?.()
  listeners.get('focus')?.()
  assert.equal(refreshes, 3)

  stop()
  assert.equal(intervals.size, 0)
  assert.equal(timeouts.size, 0)
  assert.equal(listeners.size, 0)
})
