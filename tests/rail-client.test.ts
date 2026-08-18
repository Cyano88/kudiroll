import assert from 'node:assert/strict'
import test from 'node:test'
import { createRailPayRun, resolveUnknownRailPayRun, updateRailPayRun, verifyRailPayRun } from '../src/rail/client'

test('rail client owns versioned payroll paths and forwards a stable idempotency key', async () => {
  const calls: Array<{ path: string; init: RequestInit }> = []
  const transport = async (path: string, init: RequestInit) => {
    calls.push({ path, init })
    return { ok: true }
  }
  await createRailPayRun(transport, { teamId: 'team-1', items: [] }, 'stable-idempotency-key')
  await updateRailPayRun(transport, 'run/unsafe', { status: 'prepared' })
  await verifyRailPayRun(transport, 'run/unsafe')
  await resolveUnknownRailPayRun(transport, 'run/unsafe', 'NO TRANSACTION IN READY')
  assert.equal(calls[0].path, '/api/v1/pay-runs')
  assert.deepEqual(calls[0].init.headers, { 'Idempotency-Key': 'stable-idempotency-key' })
  assert.equal(calls[1].path, '/api/v1/pay-runs/run%2Funsafe')
  assert.equal(calls[2].path, '/api/v1/pay-runs/run%2Funsafe/verify')
  assert.equal(calls[3].path, '/api/v1/pay-runs/run%2Funsafe/resolve-unknown')
  assert.equal(JSON.parse(String(calls[3].init.body)).confirmation, 'NO TRANSACTION IN READY')
})
