import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const dataFile = join(tmpdir(), `kudiroll-${randomUUID()}.json`)
process.env.KUDIROLL_DATA_FILE = dataFile
const store = await import('../src/server/account-store')
const owner = '0x123'

test.after(async () => { await rm(dataFile, { force: true }) })

test('persists teams, workers, and immutable pay-run snapshots per wallet account', async () => {
  const team = await store.createTeam(owner, { name: 'Lagos operations', description: 'Weekly team' })
  const worker = await store.addWorker(owner, team.id, { name: 'Ada Okafor', walletAddress: '0x456', defaultAmountUsdc: '1.25' })
  const run = await store.createPayRun(owner, { teamId: team.id, items: [{ workerId: worker.id, amountUsdc: '1.5' }] })
  await store.removeWorker(owner, team.id, worker.id)
  const account = await store.getAccount(owner)
  assert.equal(account.teams[0].workers.length, 0)
  assert.equal(account.payRuns[0].items[0].workerName, 'Ada Okafor')
  assert.equal(account.payRuns[0].totalUsdc, '1.5')
  assert.equal(run.status, 'draft')
})

test('keeps different wallet accounts isolated', async () => {
  await store.createTeam('0x999', { name: 'Another company' })
  assert.equal((await store.getAccount(owner)).teams.some(team => team.name === 'Another company'), false)
})

test('rejects duplicate workers in the same pay run', async () => {
  const team = await store.createTeam(owner, { name: 'Abuja support' })
  const worker = await store.addWorker(owner, team.id, { name: 'Musa Bello', walletAddress: '0x789', defaultAmountUsdc: '2' })
  await assert.rejects(
    store.createPayRun(owner, { teamId: team.id, items: [{ workerId: worker.id, amountUsdc: '1' }, { workerId: worker.id, amountUsdc: '1' }] }),
    /only once/,
  )
})

test('enforces pay-run preparation before submission and locks submitted records', async () => {
  const team = await store.createTeam(owner, { name: 'Port Harcourt logistics' })
  const worker = await store.addWorker(owner, team.id, { name: 'Chidi Eze', walletAddress: '0x987', defaultAmountUsdc: '1' })
  const run = await store.createPayRun(owner, { teamId: team.id, items: [{ workerId: worker.id, amountUsdc: '1' }] })
  await assert.rejects(
    store.updatePayRun(owner, run.id, { status: 'submitted', transactionHash: '0x123' }),
    /cannot move directly/,
  )
  await store.updatePayRun(owner, run.id, { status: 'prepared' })
  await store.updatePayRun(owner, run.id, { status: 'submitting' })
  const submitted = await store.updatePayRun(owner, run.id, { status: 'submitted', transactionHash: '0x123' })
  assert.equal(submitted.status, 'submitted')
  const finalized = await store.recordPayRunFinality(owner, run.id, { status: 'finalized', acceptedBlockNumber: 1234, message: 'Verified pool receipt.' })
  assert.equal(finalized.acceptedBlockNumber, 1234)
  await assert.rejects(store.updatePayRun(owner, run.id, { status: 'failed' }), /cannot move directly/)
  await assert.rejects(store.recordPayRunFinality(owner, run.id, { status: 'unknown', message: 'No downgrade.' }), /cannot be recorded/)
})

test('keeps unknown wallet outcomes recoverable while preventing reused transaction hashes', async () => {
  const team = await store.createTeam(owner, { name: 'Late wallet recovery' })
  const firstWorker = await store.addWorker(owner, team.id, { name: 'First Worker', walletAddress: '0x1111', defaultAmountUsdc: '1' })
  const secondWorker = await store.addWorker(owner, team.id, { name: 'Second Worker', walletAddress: '0x2222', defaultAmountUsdc: '1' })
  const first = await store.createPayRun(owner, { teamId: team.id, items: [{ workerId: firstWorker.id, amountUsdc: '1' }] })
  const second = await store.createPayRun(owner, { teamId: team.id, items: [{ workerId: secondWorker.id, amountUsdc: '1' }] })
  await store.updatePayRun(owner, first.id, { status: 'prepared' })
  await store.updatePayRun(owner, first.id, { status: 'submitting' })
  await store.updatePayRun(owner, first.id, { status: 'unknown' })
  assert.equal((await store.updatePayRun(owner, first.id, { status: 'submitted', transactionHash: '0x456' })).status, 'submitted')
  await store.recordPayRunFinality(owner, first.id, { status: 'unknown', message: 'Receipt is not final yet.' })
  assert.equal((await store.updatePayRun(owner, first.id, { status: 'unknown', transactionHash: '0x456' })).transactionHash, '0x456')
  await assert.rejects(store.updatePayRun(owner, first.id, { status: 'submitted', transactionHash: '0x457' }), /cannot change its recovered transaction hash/)
  await store.updatePayRun(owner, second.id, { status: 'prepared' })
  await store.updatePayRun(owner, second.id, { status: 'submitting' })
  await assert.rejects(store.updatePayRun(owner, second.id, { status: 'submitted', transactionHash: '0x456' }), /already attached/)
  await store.updatePayRun(owner, second.id, { status: 'failed' })
})

test('blocks new payroll while an outcome is unknown and requires explicit recovery confirmation', async () => {
  const address = '0x5151'
  const team = await store.createTeam(address, { name: 'Recovery lock team' })
  const worker = await store.addWorker(address, team.id, { name: 'Recovery Worker', walletAddress: '0x6161', defaultAmountUsdc: '1' })
  const run = await store.createPayRun(address, { teamId: team.id, items: [{ workerId: worker.id, amountUsdc: '1' }] })
  await store.updatePayRun(address, run.id, { status: 'prepared' })
  await store.updatePayRun(address, run.id, { status: 'submitting' })
  await store.updatePayRun(address, run.id, { status: 'unknown' })
  await assert.rejects(store.createPayRun(address, { teamId: team.id, items: [{ workerId: worker.id, amountUsdc: '1' }] }), /Resolve the existing unknown/)
  await assert.rejects(store.resolveUnknownPayRun(address, run.id, 'NO'), /NO TRANSACTION IN READY/)
  assert.equal((await store.resolveUnknownPayRun(address, run.id, 'NO TRANSACTION IN READY')).status, 'failed')
  assert.equal((await store.createPayRun(address, { teamId: team.id, items: [{ workerId: worker.id, amountUsdc: '1' }] })).status, 'draft')
})

test('persists a business profile and deletes only the wallet account record', async () => {
  const address = '0xabc'
  await store.createTeam(address, { name: 'Field operations' })
  const profile = await store.updateBusinessProfile(address, {
    ownerName: 'Amina Bello',
    businessName: 'Bello Foods',
    jobTitle: 'Owner',
    email: 'AMINA@EXAMPLE.COM',
    phone: '+234 800 000 0000',
  })
  assert.equal(profile.email, 'amina@example.com')
  assert.equal((await store.getAccount(address)).profile.businessName, 'Bello Foods')
  assert.deepEqual(await store.deleteAccount(address), { teams: 1, payRuns: 0 })
  const recreated = await store.getAccount(address)
  assert.equal(recreated.profile.ownerName, '')
  assert.equal(recreated.teams.length, 0)
})

test('verifies only the saved business email and clears verification after an address change', async () => {
  const address = '0xe11a1'
  await assert.rejects(store.markBusinessEmailVerified(address, 'wrong@example.com'), /no longer matches/)
  await store.updateBusinessProfile(address, { ownerName: 'Email Owner', businessName: 'Email Company', email: 'owner@example.com' })
  assert.ok((await store.markBusinessEmailVerified(address, 'owner@example.com')).emailVerifiedAt)
  await store.updateBusinessProfile(address, { ownerName: 'Email Owner', businessName: 'Email Company', email: 'new@example.com' })
  assert.equal((await store.getAccount(address)).profile.emailVerifiedAt, '')
})

test('persists only public shield evidence and deduplicates a transaction hash', async () => {
  const first = await store.recordTreasuryShield(owner, { transactionHash: '0xabc123', amountUsdc: '1.25' })
  const duplicate = await store.recordTreasuryShield(owner, { transactionHash: '0xABC123', amountUsdc: '9' })
  const account = await store.getAccount(owner)
  assert.equal(duplicate.transactionHash, first.transactionHash)
  assert.equal(account.treasuryShields.length, 1)
  assert.deepEqual(Object.keys(account.treasuryShields[0]).sort(), ['amountUsdc', 'submittedAt', 'transactionHash'])
})

test('stores passkey public credentials without exposing verification material in account views', async () => {
  const address = '0xdef'
  await store.savePasskey(address, {
    credentialId: 'credential_123',
    publicKey: 'public_key_123',
    counter: 4,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: true,
  })
  const match = await store.findPasskey('credential_123')
  assert.equal(match?.walletAddress, address)
  assert.equal(match?.passkey.publicKey, 'public_key_123')
  const view = store.publicAccount(await store.getAccount(address))
  assert.equal(view.passkeys[0].backedUp, true)
  assert.equal('publicKey' in view.passkeys[0], false)
  await store.updatePasskeyCounter(address, 'credential_123', 5)
  await assert.rejects(store.updatePasskeyCounter(address, 'credential_123', 4), /rollback/)
  await assert.rejects(store.savePasskey('0xbeef', { credentialId: 'credential_123', publicKey: 'other_key', counter: 0 }), /another KudiRoll account/)
})

test('keeps two recovery passkeys after a credential revocation', async () => {
  const address = '0xaaa'
  for (const suffix of ['one', 'two', 'three']) await store.savePasskey(address, { credentialId: `credential_${suffix}`, publicKey: `public_${suffix}`, counter: 0 })
  assert.equal(store.publicAccount(await store.getAccount(address)).recoveryReady, true)
  await store.removePasskey(address, 'credential_one')
  assert.equal((await store.getAccount(address)).passkeys.length, 2)
  await assert.rejects(store.removePasskey(address, 'credential_two'), /Add a third passkey/)
})

test('persists only a validated encrypted wallet envelope', async () => {
  const address = '0xcafe'
  const metadata = await store.saveEncryptedWalletBackup(address, {
    version: 1,
    kdf: 'HKDF-SHA-256',
    cipher: 'AES-256-GCM',
    salt: 'salt_123',
    iv: 'iv_123',
    ciphertext: 'ciphertext_123',
  })
  assert.equal(metadata.available, true)
  const backup = await store.getEncryptedWalletBackup(address)
  assert.equal(backup?.ciphertext, 'ciphertext_123')
  assert.deepEqual(Object.keys(store.publicAccount(await store.getAccount(address)).encryptedWalletBackup || {}).sort(), ['available', 'updatedAt'])
  await assert.rejects(store.saveEncryptedWalletBackup(address, { version: 1, kdf: 'password', cipher: 'AES-256-GCM' }), /unsupported/)
})
