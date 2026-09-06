import assert from 'node:assert/strict'
import test from 'node:test'
import { payrollBalanceIssue } from '../src/payroll-balance'
test('zero reserve shortage names actual balance, not a protected reserve', () => {
 assert.equal(payrollBalanceIssue(0.2, 0.018396, 0), 'Insufficient balance. This pay run needs 0.2 USDC; you have 0.018396 USDC available.')
})
test('reserve shortage is distinct and exact available balance can be spent', () => {
 assert.match(payrollBalanceIssue(2, 3, 2)!, /2 USDC protected reserve, 1 USDC is available/)
 assert.equal(payrollBalanceIssue(1, 3, 2), null)
 assert.equal(payrollBalanceIssue(3, 3, 0), null)
 assert.match(payrollBalanceIssue(1, null, 0)!, /Check your private balance/)
})
