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
  const submitted = await store.updatePayRun(owner, run.id, { status: 'submitted', transactionHash: '0x123' })
  assert.equal(submitted.status, 'submitted')
  await assert.rejects(store.updatePayRun(owner, run.id, { status: 'failed' }), /cannot be changed/)
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
