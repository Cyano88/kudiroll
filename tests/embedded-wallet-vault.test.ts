import assert from 'node:assert/strict'
import test from 'node:test'
import { addEmbeddedWalletKeySlot, openEmbeddedWalletVault, removeEmbeddedWalletKeySlot, sealEmbeddedWalletVault } from '../src/embedded-wallet/vault'

const state = { accountAddress: '0x123456789abcdef', signerProvider: 'argent-web-wallet' as const, viewingKey: '0xabcdef123456789' }
const unlock = (credentialId: string) => ({
  credentialId,
  prfInput: Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
  prfSecret: globalThis.crypto.getRandomValues(new Uint8Array(32)),
})

test('encrypts only STRK20 private state and never stores a signer private key', async () => {
  const first = unlock('credential_one')
  const vault = await sealEmbeddedWalletVault(state, first)
  assert.equal(vault.version, 2)
  assert.equal(vault.signerProvider, 'argent-web-wallet')
  assert.equal(JSON.stringify(vault).includes(state.viewingKey), false)
  assert.equal(JSON.stringify(vault).includes('signerPrivateKey'), false)
  assert.deepEqual(await openEmbeddedWalletVault(vault, first), state)
})

test('authorizes independent recovery passkeys with separate wrapped-key slots', async () => {
  const first = unlock('credential_one')
  const second = unlock('credential_two')
  const third = unlock('credential_three')
  let vault = await sealEmbeddedWalletVault(state, first)
  vault = await addEmbeddedWalletKeySlot(vault, first, second)
  vault = await addEmbeddedWalletKeySlot(vault, second, third)
  assert.deepEqual(await openEmbeddedWalletVault(vault, third), state)
  assert.equal(removeEmbeddedWalletKeySlot(vault, 'credential_one').keySlots.length, 2)
  assert.throws(() => removeEmbeddedWalletKeySlot(removeEmbeddedWalletKeySlot(vault, 'credential_one'), 'credential_two'), /at least two/)
})

test('rejects wrong PRF output, unauthorized credentials, and modified ciphertext', async () => {
  const first = unlock('credential_one')
  const vault = await sealEmbeddedWalletVault(state, first)
  await assert.rejects(openEmbeddedWalletVault(vault, { ...first, prfSecret: unlock('x').prfSecret }), /could not unlock/)
  await assert.rejects(openEmbeddedWalletVault(vault, unlock('credential_other')), /not authorized/)
  const replacement = vault.ciphertext.endsWith('A') ? 'B' : 'A'
  await assert.rejects(openEmbeddedWalletVault({ ...vault, ciphertext: vault.ciphertext.slice(0, -1) + replacement }, first), /could not unlock|malformed/)
})

test('rejects malformed private state and short PRF material', async () => {
  await assert.rejects(sealEmbeddedWalletVault({ ...state, viewingKey: 'not-a-key' }, unlock('credential_one')), /viewing key/)
  await assert.rejects(sealEmbeddedWalletVault(state, { ...unlock('credential_one'), prfSecret: new Uint8Array(16) }), /too short/)
})
