import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkerCsv, WORKER_CSV_TEMPLATE } from '../src/worker-csv'
test('CSV supports BOM, reordered headers, CRLF, quoted commas and escaped quotes', () => {
 const rows = parseWorkerCsv('\uFEFFwalletAddress,name,defaultAmountUsdc\r\n0xabc,"Ada, ""AJ""",1.25\r\n')
 assert.deepEqual(rows, [{ name: 'Ada, "AJ"', walletAddress: '0xabc', defaultAmountUsdc: '1.25' }])
})
test('CSV rejects malformed quoting, missing columns, oversized and empty imports', () => {
 for (const csv of [WORKER_CSV_TEMPLATE, 'name,name,defaultAmountUsdc\na,b,1', WORKER_CSV_TEMPLATE + '"Ada,0xabc,1', WORKER_CSV_TEMPLATE + 'Ada,0xabc', WORKER_CSV_TEMPLATE + '"Ada"oops,0xabc,1', 'x'.repeat(24001)]) assert.throws(() => parseWorkerCsv(csv))
})
