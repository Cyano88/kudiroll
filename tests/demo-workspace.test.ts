import assert from 'node:assert/strict'
import test from 'node:test'
import { demoAccount, demoPayouts, isPublicDemoPath } from '../src/demo-workspace'

test('public demo route matches only the dedicated workspace path', () => {
  assert.equal(isPublicDemoPath('/demo'), true)
  assert.equal(isPublicDemoPath('/demo/'), true)
  assert.equal(isPublicDemoPath('/'), false)
  assert.equal(isPublicDemoPath('/demo/payroll'), false)
})

test('demo workspace is sanitized and contains judge-visible product states', () => {
  assert.match(demoAccount.profile.email, /\.example$/)
  assert.equal(demoAccount.payRuns[0]?.status, 'finalized')
  assert.equal(demoAccount.treasuryAuditVerified, true)
  assert.equal(demoPayouts[0]?.displayStatus, 'reconciliation-required')

  const serialized = JSON.stringify({ demoAccount, demoPayouts }).toLowerCase()
  for (const forbidden of ['privatekey', 'private_key', 'viewingkey', 'viewing_key', 'mnemonic', 'recovery phrase']) {
    assert.equal(serialized.includes(forbidden), false)
  }
})
