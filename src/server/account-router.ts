import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { RpcProvider, constants } from 'starknet'
import { addWorker, createPayRun, createTeam, deleteAccount, deleteTeam, getAccount, recordTreasuryShield, removeWorker, updateBusinessProfile, updatePayRun, updateTeam } from './account-store'
import { deriveTreasuryReadiness } from '../treasury-readiness'

type Challenge = { address: string; expiresAt: number; typedData: any }
type Session = { address: string; expiresAt: number }

const challenges = new Map<string, Challenge>()
const sessions = new Map<string, Session>()

function statusOf(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) return Number(error.status) || 500
  return 500
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected account failure.'
}

function addressOf(value: unknown) {
  const address = String(value ?? '').trim().toLowerCase()
  if (!/^0x[0-9a-f]{1,64}$/.test(address)) throw Object.assign(new Error('A valid Starknet wallet address is required.'), { status: 400 })
  return address
}

function cookies(value = '') {
  return Object.fromEntries(value.split(';').map(item => item.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2))
}

export function requireSessionAddress(req: any) {
  const token = cookies(req.headers.cookie).kudiroll_session
  const session = token ? sessions.get(token) : null
  if (!session || session.expiresAt <= Date.now()) throw Object.assign(new Error('Your KudiRoll session has expired. Sign in again.'), { status: 401 })
  return session.address
}

function typedChallenge(address: string, nonce: string, issuedAt: number, expiresAt: number) {
  return {
    types: {
      StarkNetDomain: [
        { name: 'name', type: 'felt' },
        { name: 'version', type: 'felt' },
        { name: 'chainId', type: 'felt' },
      ],
      KudiRollSession: [
        { name: 'wallet', type: 'felt' },
        { name: 'nonce', type: 'felt' },
        { name: 'issued_at', type: 'felt' },
        { name: 'expires_at', type: 'felt' },
      ],
    },
    primaryType: 'KudiRollSession',
    domain: { name: 'KudiRoll', version: '1', chainId: constants.StarknetChainId.SN_MAIN },
    message: { wallet: address, nonce, issued_at: String(issuedAt), expires_at: String(expiresAt) },
  }
}

function provider() {
  const nodeUrl = process.env.STARKNET_RPC_URL?.trim()
  return nodeUrl
    ? new RpcProvider({ nodeUrl })
    : new RpcProvider({ nodeUrl: constants.NetworkName.SN_MAIN })
}

async function treasuryReadiness(address: string) {
  const account = await getAccount(address)
  const shield = account.treasuryShields[0] ?? null
  if (!shield) return deriveTreasuryReadiness(null, { outcome: 'pending' })
  try {
    const rpc = provider()
    const receipt = await rpc.getTransactionReceipt(shield.transactionHash)
    if (receipt.isError()) return deriveTreasuryReadiness(shield, { outcome: 'unknown' })
    const value = receipt.value as { block_number?: number }
    if (receipt.isReverted()) return deriveTreasuryReadiness(shield, { outcome: 'reverted', acceptedBlockNumber: value.block_number })
    const acceptedBlockNumber = value.block_number
    if (acceptedBlockNumber === undefined) return deriveTreasuryReadiness(shield, { outcome: 'pending' })
    return deriveTreasuryReadiness(shield, { outcome: 'succeeded', acceptedBlockNumber, currentBlockNumber: await rpc.getBlockNumber() })
  } catch (error: any) {
    const message = String(error?.message || error)
    return deriveTreasuryReadiness(shield, { outcome: /not found|transaction hash not found|code.?29/i.test(message) ? 'pending' : 'unknown' })
  }
}

export function createAccountRouter() {
  const router = Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.post('/challenge', (req, res) => {
    try {
      const address = addressOf(req.body?.address)
      const nonce = `0x${randomBytes(24).toString('hex')}`
      const issuedAt = Math.floor(Date.now() / 1000)
      const expiresAt = issuedAt + 5 * 60
      const typedData = typedChallenge(address, nonce, issuedAt, expiresAt)
      challenges.set(nonce, { address, expiresAt: expiresAt * 1000, typedData })
      res.json({ ok: true, challenge: { nonce, typedData } })
    } catch (error) {
      res.status(statusOf(error)).json({ ok: false, error: messageOf(error) })
    }
  })

  router.post('/session', async (req, res) => {
    try {
      const address = addressOf(req.body?.address)
      const nonce = String(req.body?.nonce || '')
      const signature = Array.isArray(req.body?.signature) ? req.body.signature.map(String) : []
      const challenge = challenges.get(nonce)
      if (!challenge || challenge.address !== address || challenge.expiresAt <= Date.now()) throw Object.assign(new Error('This sign-in request expired. Try again.'), { status: 401 })
      if (!signature.length) throw Object.assign(new Error('Wallet signature is required.'), { status: 400 })
      const valid = await provider().verifyMessageInStarknet(challenge.typedData, signature, address)
      if (!valid) throw Object.assign(new Error('The wallet signature could not be verified.'), { status: 401 })
      challenges.delete(nonce)
      const token = randomBytes(32).toString('base64url')
      sessions.set(token, { address, expiresAt: Date.now() + 12 * 60 * 60 * 1000 })
      res.setHeader('Set-Cookie', `kudiroll_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
      res.json({ ok: true, account: await getAccount(address) })
    } catch (error) {
      res.status(statusOf(error)).json({ ok: false, error: messageOf(error) })
    }
  })

  router.delete('/session', (req, res) => {
    const token = cookies(req.headers.cookie).kudiroll_session
    if (token) sessions.delete(token)
    res.setHeader('Set-Cookie', 'kudiroll_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
    res.json({ ok: true })
  })

  router.get('/me', async (req, res) => {
    try {
      res.json({ ok: true, account: await getAccount(requireSessionAddress(req)) })
    } catch (error) {
      res.status(statusOf(error)).json({ ok: false, error: messageOf(error) })
    }
  })

  router.post('/treasury/shields', async (req, res) => {
    try { res.status(201).json({ ok: true, shield: await recordTreasuryShield(requireSessionAddress(req), req.body) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })

  router.get('/treasury/readiness', async (req, res) => {
    try { res.json({ ok: true, readiness: await treasuryReadiness(requireSessionAddress(req)) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })

  router.patch('/profile', async (req, res) => {
    try { res.json({ ok: true, profile: await updateBusinessProfile(requireSessionAddress(req), req.body) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })

  router.delete('/', async (req, res) => {
    try {
      const address = requireSessionAddress(req)
      if (req.body?.confirmation !== 'DELETE KUDIROLL ACCOUNT') throw Object.assign(new Error('Type DELETE KUDIROLL ACCOUNT to confirm.'), { status: 400 })
      const deleted = await deleteAccount(address)
      for (const [token, candidate] of sessions) if (candidate.address === address) sessions.delete(token)
      res.setHeader('Set-Cookie', 'kudiroll_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
      res.json({ ok: true, deleted })
    } catch (error) {
      res.status(statusOf(error)).json({ ok: false, error: messageOf(error) })
    }
  })

  router.post('/teams', async (req, res) => {
    try { res.status(201).json({ ok: true, team: await createTeam(requireSessionAddress(req), req.body) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })
  router.patch('/teams/:teamId', async (req, res) => {
    try { res.json({ ok: true, team: await updateTeam(requireSessionAddress(req), req.params.teamId, req.body) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })
  router.delete('/teams/:teamId', async (req, res) => {
    try { res.json({ ok: true, deleted: await deleteTeam(requireSessionAddress(req), req.params.teamId) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })
  router.post('/teams/:teamId/workers', async (req, res) => {
    try { res.status(201).json({ ok: true, worker: await addWorker(requireSessionAddress(req), req.params.teamId, req.body) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })
  router.delete('/teams/:teamId/workers/:workerId', async (req, res) => {
    try { res.json({ ok: true, deleted: await removeWorker(requireSessionAddress(req), req.params.teamId, req.params.workerId) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })
  router.post('/pay-runs', async (req, res) => {
    try { res.status(201).json({ ok: true, payRun: await createPayRun(requireSessionAddress(req), req.body) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })
  router.patch('/pay-runs/:payRunId', async (req, res) => {
    try { res.json({ ok: true, payRun: await updatePayRun(requireSessionAddress(req), req.params.payRunId, req.body) }) }
    catch (error) { res.status(statusOf(error)).json({ ok: false, error: messageOf(error) }) }
  })

  return router
}
