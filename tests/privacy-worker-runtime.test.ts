import assert from 'node:assert/strict'
import test from 'node:test'
import { PrivacyWorkerRuntime } from '../src/embedded-wallet/privacy-worker-runtime'
import { sealEmbeddedWalletVault } from '../src/embedded-wallet/vault'

const state = { accountAddress: '0x123456789abcdef', signerProvider: 'argent-web-wallet' as const, viewingKey: '0xabcdef123456789' }
const unlock = () => ({
  credentialId: 'credential_one',
  prfInput: Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
  prfSecret: globalThis.crypto.getRandomValues(new Uint8Array(32)),
})

test('keeps decrypted STRK20 state inside the worker runtime', async () => {
  const runtime = new PrivacyWorkerRuntime()
  const key = unlock()
  const vault = await sealEmbeddedWalletVault(state, key)
  const transferredSecret = key.prfSecret.slice().buffer
  const response = await runtime.handle({ id: 'unlock_one', type: 'unlock', vault, credentialId: key.credentialId, prfInput: key.prfInput, prfSecret: transferredSecret })

  assert.deepEqual(response, { id: 'unlock_one', ok: true, result: { locked: false, accountAddress: state.accountAddress, signerProvider: state.signerProvider } })
  assert.equal(JSON.stringify(response).includes(state.viewingKey), false)
  assert.equal(new Uint8Array(transferredSecret).every(byte => byte === 0), true)
  assert.deepEqual(await runtime.handle({ id: 'status_one', type: 'status' }), { id: 'status_one', ok: true, result: { locked: false, accountAddress: state.accountAddress, signerProvider: state.signerProvider } })
  assert.deepEqual(await runtime.handle({ id: 'lock_one', type: 'lock' }), { id: 'lock_one', ok: true, result: { locked: true } })
})

test('locks after a failed unlock and returns no private state', async () => {
  const runtime = new PrivacyWorkerRuntime()
  const key = unlock()
  const vault = await sealEmbeddedWalletVault(state, key)
  const wrongSecret = globalThis.crypto.getRandomValues(new Uint8Array(32)).buffer
  const response = await runtime.handle({ id: 'unlock_bad', type: 'unlock', vault, credentialId: key.credentialId, prfInput: key.prfInput, prfSecret: wrongSecret })

  assert.equal(response.ok, false)
  assert.equal(JSON.stringify(response).includes(state.viewingKey), false)
  assert.equal(new Uint8Array(wrongSecret).every(byte => byte === 0), true)
  assert.deepEqual(await runtime.handle({ id: 'status_bad', type: 'status' }), { id: 'status_bad', ok: true, result: { locked: true } })
})
