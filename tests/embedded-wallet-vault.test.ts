import assert from 'node:assert/strict'
import test from 'node:test'
import { openEmbeddedWalletVault, sealEmbeddedWalletVault } from '../src/embedded-wallet/vault'

const secrets = {
  signerPrivateKey: '0x123456789abcdef',
  viewingKey: '0xabcdef123456789',
}

function unlockSecret() {
  return globalThis.crypto.getRandomValues(new Uint8Array(32))
}

test('encrypts embedded wallet secrets without persisting plaintext', async () => {
  const unlock = unlockSecret()
  const vault = await sealEmbeddedWalletVault(secrets, unlock)
  assert.equal(vault.version, 1)
  assert.equal(vault.kdf, 'HKDF-SHA-256')
  assert.equal(vault.cipher, 'AES-256-GCM')
  assert.equal(JSON.stringify(vault).includes(secrets.signerPrivateKey), false)
  assert.equal(JSON.stringify(vault).includes(secrets.viewingKey), false)
  assert.deepEqual(await openEmbeddedWalletVault(vault, unlock), secrets)
})

test('rejects the wrong passkey unlock secret', async () => {
  const vault = await sealEmbeddedWalletVault(secrets, unlockSecret())
  await assert.rejects(openEmbeddedWalletVault(vault, unlockSecret()), /could not unlock/)
})

test('rejects modified vault ciphertext', async () => {
  const unlock = unlockSecret()
  const vault = await sealEmbeddedWalletVault(secrets, unlock)
  const replacement = vault.ciphertext.endsWith('A') ? 'B' : 'A'
  await assert.rejects(openEmbeddedWalletVault({ ...vault, ciphertext: vault.ciphertext.slice(0, -1) + replacement }, unlock), /could not unlock|malformed/)
})

test('rejects malformed secrets and short unlock material', async () => {
  await assert.rejects(sealEmbeddedWalletVault({ ...secrets, viewingKey: 'not-a-key' }, unlockSecret()), /viewing key/)
  await assert.rejects(sealEmbeddedWalletVault(secrets, new Uint8Array(16)), /too short/)
})
