import assert from 'node:assert/strict'
import test from 'node:test'
import { createExtensionlessSigner } from '../src/embedded-wallet/signer'

function account(chainId = 'SN_MAIN') {
  return {
    address: '0xABC',
    async execute() { return { transaction_hash: '0x123' } },
    async signMessage() { return ['0x1', '0x2'] },
    async getChainId() { return chainId },
  }
}

test('preserves smart-account signatures and transaction execution', async () => {
  const signer = createExtensionlessSigner('argent-web-wallet', account() as any)
  assert.equal(signer.address, '0xabc')
  assert.deepEqual(await signer.signMessage({} as any), ['0x1', '0x2'])
  assert.equal((await signer.execute([])).transaction_hash, '0x123')
  await signer.assertMainnet()
})

test('rejects non-mainnet and invalid account addresses', async () => {
  const signer = createExtensionlessSigner('argent-web-wallet', account('SN_SEPOLIA') as any)
  await assert.rejects(signer.assertMainnet(), /Mainnet only/)
  assert.throws(() => createExtensionlessSigner('argent-web-wallet', { ...account(), address: 'bad' } as any), /invalid Starknet address/)
})
