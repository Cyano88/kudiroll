import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export type SavedWorker = {
  id: string
  name: string
  walletAddress: string
  defaultAmountUsdc: string
  createdAt: string
  updatedAt: string
}

export type SavedTeam = {
  id: string
  name: string
  description: string
  workers: SavedWorker[]
  createdAt: string
  updatedAt: string
}

export type SavedPayRunItem = {
  id: string
  workerId: string
  workerName: string
  walletAddress: string
  amountUsdc: string
  status: 'draft' | 'prepared' | 'submitted' | 'failed'
}

export type SavedPayRun = {
  id: string
  teamId: string
  teamName: string
  status: 'draft' | 'prepared' | 'submitted' | 'failed'
  totalUsdc: string
  items: SavedPayRunItem[]
  transactionHash: string
  createdAt: string
  updatedAt: string
}

export type BusinessProfile = {
  ownerName: string
  businessName: string
  jobTitle: string
  email: string
  phone: string
  updatedAt: string
}

type AccountRecord = { walletAddress: string; profile: BusinessProfile; teams: SavedTeam[]; payRuns: SavedPayRun[]; createdAt: string; updatedAt: string }
type StoreFile = { version: 1; accounts: Record<string, AccountRecord> }

const storePath = resolve(process.env.KUDIROLL_DATA_FILE || '.data/kudiroll.json')
let queue = Promise.resolve()

function cleanText(value: unknown, maximum: number) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maximum)
}

function walletAddress(value: unknown) {
  const address = cleanText(value, 66).toLowerCase()
  if (!/^0x[0-9a-f]{1,64}$/.test(address)) throw Object.assign(new Error('Enter a valid Starknet wallet address.'), { status: 400 })
  return address
}

function amount(value: unknown) {
  const text = cleanText(value, 32)
  if (!/^\d+(?:\.\d{1,6})?$/.test(text) || Number(text) <= 0) throw Object.assign(new Error('Enter a positive USDC amount with at most 6 decimals.'), { status: 400 })
  return text
}

function amountUnits(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

function emptyProfile(): BusinessProfile {
  return { ownerName: '', businessName: '', jobTitle: '', email: '', phone: '', updatedAt: '' }
}

async function readStore(): Promise<StoreFile> {
  try {
    const parsed = JSON.parse(await readFile(storePath, 'utf8'))
    return parsed?.version === 1 && parsed?.accounts ? parsed : { version: 1, accounts: {} }
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { version: 1, accounts: {} }
    throw error
  }
}

async function writeStore(store: StoreFile) {
  await mkdir(dirname(storePath), { recursive: true })
  const temporary = `${storePath}.tmp`
  await writeFile(temporary, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, storePath)
}

async function mutate<T>(operation: (store: StoreFile) => T | Promise<T>) {
  let result!: T
  const next = queue.catch(() => undefined).then(async () => {
    const store = await readStore()
    result = await operation(store)
    await writeStore(store)
  })
  queue = next
  await next
  return result
}

function accountIn(store: StoreFile, address: string) {
  const key = walletAddress(address)
  const now = new Date().toISOString()
  const account = store.accounts[key] ?? (store.accounts[key] = { walletAddress: key, profile: emptyProfile(), teams: [], payRuns: [], createdAt: now, updatedAt: now })
  account.profile ??= emptyProfile()
  return account
}

export async function getAccount(address: string) {
  const store = await readStore()
  return accountIn(store, address)
}

export async function updateBusinessProfile(address: string, input: any) {
  return mutate(store => {
    const account = accountIn(store, address)
    const ownerName = cleanText(input?.ownerName, 80)
    const businessName = cleanText(input?.businessName, 100)
    const jobTitle = cleanText(input?.jobTitle, 80)
    const email = cleanText(input?.email, 160).toLowerCase()
    const phone = cleanText(input?.phone, 24)
    if (ownerName.length < 2) throw Object.assign(new Error('Enter the account owner’s full name.'), { status: 400 })
    if (businessName.length < 2) throw Object.assign(new Error('Enter the business name.'), { status: 400 })
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid business email address.'), { status: 400 })
    if (phone && !/^\+?[0-9 ()-]{7,24}$/.test(phone)) throw Object.assign(new Error('Enter a valid phone number.'), { status: 400 })
    const now = new Date().toISOString()
    account.profile = { ownerName, businessName, jobTitle, email, phone, updatedAt: now }
    account.updatedAt = now
    return account.profile
  })
}

export async function deleteAccount(address: string) {
  return mutate(store => {
    const key = walletAddress(address)
    const account = store.accounts[key]
    const deleted = { teams: account?.teams.length ?? 0, payRuns: account?.payRuns.length ?? 0 }
    delete store.accounts[key]
    return deleted
  })
}

export async function createTeam(address: string, input: any) {
  return mutate(store => {
    const account = accountIn(store, address)
    const name = cleanText(input?.name, 60)
    if (name.length < 2) throw Object.assign(new Error('Team name must contain at least 2 characters.'), { status: 400 })
    if (account.teams.some(team => team.name.toLowerCase() === name.toLowerCase())) throw Object.assign(new Error('A team with this name already exists.'), { status: 409 })
    const now = new Date().toISOString()
    const team: SavedTeam = { id: randomUUID(), name, description: cleanText(input?.description, 160), workers: [], createdAt: now, updatedAt: now }
    account.teams.unshift(team)
    account.updatedAt = now
    return team
  })
}

export async function updateTeam(address: string, teamId: string, input: any) {
  return mutate(store => {
    const account = accountIn(store, address)
    const team = account.teams.find(item => item.id === teamId)
    if (!team) throw Object.assign(new Error('Team not found.'), { status: 404 })
    const name = cleanText(input?.name, 60)
    if (name.length < 2) throw Object.assign(new Error('Team name must contain at least 2 characters.'), { status: 400 })
    if (account.teams.some(item => item.id !== team.id && item.name.toLowerCase() === name.toLowerCase())) throw Object.assign(new Error('A team with this name already exists.'), { status: 409 })
    team.name = name
    team.description = cleanText(input?.description, 160)
    team.updatedAt = new Date().toISOString()
    account.updatedAt = team.updatedAt
    return team
  })
}

export async function deleteTeam(address: string, teamId: string) {
  return mutate(store => {
    const account = accountIn(store, address)
    const before = account.teams.length
    account.teams = account.teams.filter(team => team.id !== teamId)
    if (account.teams.length === before) throw Object.assign(new Error('Team not found.'), { status: 404 })
    account.updatedAt = new Date().toISOString()
    return { id: teamId }
  })
}

export async function addWorker(address: string, teamId: string, input: any) {
  return mutate(store => {
    const account = accountIn(store, address)
    const team = account.teams.find(item => item.id === teamId)
    if (!team) throw Object.assign(new Error('Team not found.'), { status: 404 })
    const name = cleanText(input?.name, 80)
    const workerWallet = walletAddress(input?.walletAddress)
    if (name.length < 2) throw Object.assign(new Error('Worker name must contain at least 2 characters.'), { status: 400 })
    if (team.workers.some(worker => worker.walletAddress === workerWallet)) throw Object.assign(new Error('This wallet is already in the team.'), { status: 409 })
    const now = new Date().toISOString()
    const worker: SavedWorker = { id: randomUUID(), name, walletAddress: workerWallet, defaultAmountUsdc: amount(input?.defaultAmountUsdc), createdAt: now, updatedAt: now }
    team.workers.push(worker)
    team.updatedAt = now
    account.updatedAt = now
    return worker
  })
}

export async function removeWorker(address: string, teamId: string, workerId: string) {
  return mutate(store => {
    const account = accountIn(store, address)
    const team = account.teams.find(item => item.id === teamId)
    if (!team) throw Object.assign(new Error('Team not found.'), { status: 404 })
    const before = team.workers.length
    team.workers = team.workers.filter(worker => worker.id !== workerId)
    if (team.workers.length === before) throw Object.assign(new Error('Worker not found.'), { status: 404 })
    team.updatedAt = new Date().toISOString()
    account.updatedAt = team.updatedAt
    return { id: workerId }
  })
}

export async function createPayRun(address: string, input: any) {
  return mutate(store => {
    const account = accountIn(store, address)
    const team = account.teams.find(item => item.id === cleanText(input?.teamId, 64))
    if (!team) throw Object.assign(new Error('Select a saved team.'), { status: 404 })
    const requested = Array.isArray(input?.items) ? input.items : []
    if (!requested.length) throw Object.assign(new Error('Select at least one worker.'), { status: 400 })
    const workerIds = requested.map((item: any) => cleanText(item?.workerId, 64))
    if (new Set(workerIds).size !== workerIds.length) throw Object.assign(new Error('Each worker can appear only once in a pay run.'), { status: 400 })
    const items: SavedPayRunItem[] = requested.map((item: any): SavedPayRunItem => {
      const worker = team.workers.find(candidate => candidate.id === cleanText(item?.workerId, 64))
      if (!worker) throw Object.assign(new Error('A selected worker is no longer in this team.'), { status: 400 })
      return { id: randomUUID(), workerId: worker.id, workerName: worker.name, walletAddress: worker.walletAddress, amountUsdc: amount(item?.amountUsdc), status: 'draft' }
    })
    const total = items.reduce((sum: bigint, item: SavedPayRunItem) => sum + amountUnits(item.amountUsdc), 0n)
    const now = new Date().toISOString()
    const payRun: SavedPayRun = { id: randomUUID(), teamId: team.id, teamName: team.name, status: 'draft', totalUsdc: `${total / 1_000_000n}.${(total % 1_000_000n).toString().padStart(6, '0')}`.replace(/\.?0+$/, ''), items, transactionHash: '', createdAt: now, updatedAt: now }
    account.payRuns.unshift(payRun)
    account.updatedAt = now
    return payRun
  })
}

export async function updatePayRun(address: string, payRunId: string, input: any) {
  return mutate(store => {
    const account = accountIn(store, address)
    const payRun = account.payRuns.find(item => item.id === payRunId)
    if (!payRun) throw Object.assign(new Error('Pay run not found.'), { status: 404 })
    const status = cleanText(input?.status, 24)
    if (!['prepared', 'submitted', 'failed'].includes(status)) throw Object.assign(new Error('Invalid pay-run status.'), { status: 400 })
    if (payRun.status === 'submitted') throw Object.assign(new Error('A submitted pay run cannot be changed.'), { status: 409 })
    const transitions: Record<SavedPayRun['status'], SavedPayRun['status'][]> = {
      draft: ['prepared', 'failed'],
      prepared: ['prepared', 'submitted', 'failed'],
      failed: ['prepared', 'failed'],
      submitted: [],
    }
    if (!transitions[payRun.status].includes(status as SavedPayRun['status'])) {
      throw Object.assign(new Error(`A ${payRun.status} pay run cannot move directly to ${status}.`), { status: 409 })
    }
    const transactionHash = cleanText(input?.transactionHash, 80)
    if (status === 'submitted' && !/^0x[0-9a-fA-F]{1,64}$/.test(transactionHash)) throw Object.assign(new Error('A transaction hash is required for a submitted pay run.'), { status: 400 })
    payRun.status = status as SavedPayRun['status']
    payRun.transactionHash = status === 'submitted' ? transactionHash : payRun.transactionHash
    payRun.items = payRun.items.map(item => ({ ...item, status: status as SavedPayRunItem['status'] }))
    payRun.updatedAt = new Date().toISOString()
    account.updatedAt = payRun.updatedAt
    return payRun
  })
}
