import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDepositAction, buildPrivatePayrollActions, buildPrivateTransferAction, buildWithdrawAction, isStarknetAddress, isStarknetMainnet, KUDIROLL_MIN_SHIELD_USDC, normalizeStarknetAddress, requireStarknetMainnet, simulatePrivatePayroll, simulateUsdcShield, supportsStrk20Api, toUsdcBaseUnits, withTimeout } from '../src/phase0'
import {
  STARKNET_USDC,
  createPhase0PaycrestOrder,
  listPaycrestInstitutions,
  listPaycrestOrders,
  runPublicPaycrestProbe,
  verifyPaycrestAccount,
} from '../src/server/paycrest'

test('validates Starknet addresses without accepting EVM-length assumptions', () => {
  assert.equal(isStarknetAddress('0x1'), true)
  assert.equal(isStarknetAddress(`0x${'a'.repeat(64)}`), true)
  assert.equal(isStarknetAddress(`0x${'a'.repeat(65)}`), false)
  assert.equal(isStarknetAddress('not-an-address'), false)
})

test('normalizes Starknet addresses before constructing actions', () => {
  assert.equal(normalizeStarknetAddress('  0xAbC  '), '0xabc')
  assert.throws(() => normalizeStarknetAddress('SN_MAIN'), /valid Starknet address/)
})

test('accepts compatible STRK20 API versions without exact-string gating', () => {
  assert.equal(supportsStrk20Api(['0.10.3']), true)
  assert.equal(supportsStrk20Api(['0.10.4']), true)
  assert.equal(supportsStrk20Api(['0.11.0']), true)
  assert.equal(supportsStrk20Api(['0.10.2', 'invalid']), false)
})

test('times out a wallet operation with a useful error', async () => {
  await assert.rejects(withTimeout(new Promise(() => undefined), 5), /Wallet request timed out/)
})

test('accepts Starknet Mainnet chain identifiers and rejects every other network', () => {
  assert.equal(isStarknetMainnet('SN_MAIN'), true)
  assert.equal(isStarknetMainnet('0x534e5f4d41494e'), true)
  assert.equal(isStarknetMainnet(BigInt('0x534e5f4d41494e')), true)
  assert.equal(isStarknetMainnet('SN_SEPOLIA'), false)
  assert.equal(isStarknetMainnet(undefined), false)
  assert.throws(() => requireStarknetMainnet('SN_SEPOLIA'), /Mainnet only/)
})

test('converts six-decimal USDC exactly', () => {
  assert.equal(toUsdcBaseUnits('1'), '0xf4240')
  assert.equal(toUsdcBaseUnits('0.000001'), '0x1')
  assert.equal(toUsdcBaseUnits('12.345678'), '0xbc614e')
  assert.throws(() => toUsdcBaseUnits('1.0000001'))
})

test('builds the exact STRK20 public-recipient withdrawal action', () => {
  assert.deepEqual(buildWithdrawAction('0x123', '1'), {
    type: 'withdraw', token: STARKNET_USDC, amount: '0xf4240', recipient: '0x123',
  })
})

test('builds the exact STRK20 shield deposit action', () => {
  assert.deepEqual(buildDepositAction('1'), {
    type: 'deposit', token: STARKNET_USDC, amount: '0xf4240',
  })
})

test('enforces a disclosed KudiRoll shield minimum without calling it a protocol fee', () => {
  assert.equal(KUDIROLL_MIN_SHIELD_USDC, '0.01')
  assert.throws(() => buildDepositAction('0.009999'), /product minimum is not a protocol fee/)
})

test('routes shield simulation through the typed wallet facade', async () => {
  const calls: unknown[] = []
  const wallet = {
    strk20Balances: async () => [],
    strk20PrepareInvoke: async (actions: unknown, simulate?: boolean) => { calls.push({ actions, simulate }); return {} as never },
    strk20InvokeTransaction: async () => ({ transaction_hash: '0x1' }),
  }
  await simulateUsdcShield(wallet as never, '1')
  assert.deepEqual(calls, [{ actions: [{ type: 'deposit', token: STARKNET_USDC, amount: '0xf4240' }], simulate: true }])
})

test('builds the exact STRK20 private payroll transfer action', () => {
  assert.deepEqual(buildPrivateTransferAction('0x456', '2.5'), {
    type: 'transfer', token: STARKNET_USDC, amount: '0x2625a0', recipient: '0x456',
  })
})

test('prepares every recipient as one atomic private payroll action list', async () => {
  const calls: unknown[] = []
  const wallet = {
    strk20Balances: async () => [],
    strk20PrepareInvoke: async (actions: unknown, simulate?: boolean) => { calls.push({ actions, simulate }); return {} as never },
    strk20InvokeTransaction: async () => ({ transaction_hash: '0x1' }),
  }
  await simulatePrivatePayroll(wallet as never, [{ recipient: '0x1', amountUsdc: '1' }, { recipient: '0x2', amountUsdc: '2' }])
  assert.deepEqual(calls, [{ actions: [
    { type: 'transfer', token: STARKNET_USDC, amount: '0xf4240', recipient: '0x1' },
    { type: 'transfer', token: STARKNET_USDC, amount: '0x1e8480', recipient: '0x2' },
  ], simulate: true }])
  assert.throws(() => buildPrivatePayrollActions([{ recipient: '0x01', amountUsdc: '1' }, { recipient: '0x1', amountUsdc: '2' }]), /only once/)
})

test('public Paycrest probe verifies live response shapes without secrets', async () => {
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input)
    const data = url.endsWith('/v2/tokens')
      ? [{ symbol: 'USDC', network: 'starknet', contractAddress: STARKNET_USDC, decimals: 6 }]
      : { sell: { rate: '1379.75', orderType: 'regular', refundTimeoutMinutes: 2 } }
    return new Response(JSON.stringify({ status: 'success', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const result = await runPublicPaycrestProbe(fakeFetch as typeof fetch)
  assert.equal(result.ok, true)
  assert.equal(result.quote?.rate, '1379.75')
})

test('normalizes Paycrest institutions and verifies an account name', async () => {
  const previousKey = process.env.PAYCREST_API_KEY
  process.env.PAYCREST_API_KEY = 'test-key'
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/v2/institutions/NGN')) {
      return new Response(JSON.stringify({ data: { items: [{ code: '058', name: 'Example Bank', type: 'bank' }] } }), { status: 200 })
    }
    assert.equal(init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(init?.body)), { institution: '058', accountIdentifier: '0123456789' })
    return new Response(JSON.stringify({ data: { accountName: 'TEST RECIPIENT' } }), { status: 200 })
  }
  try {
    assert.deepEqual(await listPaycrestInstitutions(fakeFetch as typeof fetch), [{ code: '058', name: 'Example Bank', type: 'bank' }])
    assert.deepEqual(await verifyPaycrestAccount({ institution: '058', accountIdentifier: '0123456789' }, fakeFetch as typeof fetch), { accountName: 'TEST RECIPIENT' })
  } finally {
    if (previousKey === undefined) delete process.env.PAYCREST_API_KEY
    else process.env.PAYCREST_API_KEY = previousKey
  }
})

test('sanitizes Paycrest order history and derives the Naira payout', async () => {
  const previousKey = process.env.PAYCREST_API_KEY
  process.env.PAYCREST_API_KEY = 'test-key'
  const fakeFetch = async () => new Response(JSON.stringify({ data: { items: [{
    id: 'order-1', status: 'initiated', amount: '0.722022', senderFee: '0.0022', transactionFee: '0', rate: '1385', reference: 'kudiroll-demo-1',
    source: { type: 'crypto', currency: 'USDC', network: 'starknet', refundAddress: '0xabc' },
    destination: { type: 'fiat', currency: 'NGN', recipient: { accountName: 'TEST RECIPIENT', accountIdentifier: '0123456789' } },
    createdAt: '2026-07-17T21:25:37Z', updatedAt: '2026-07-17T22:26:45Z',
  }, {
    id: 'order-2', status: 'initiated', amount: '1', rate: '1385', reference: 'kudiroll-demo-2',
    source: { type: 'crypto', currency: 'USDC', network: 'starknet', refundAddress: '0xdef' },
    destination: { type: 'fiat', currency: 'NGN', recipient: { accountName: 'OTHER BUSINESS', accountIdentifier: '0987654321' } },
  }] } }), { status: 200 })
  try {
    const orders = await listPaycrestOrders('0xabc', fakeFetch as typeof fetch)
    assert.equal(orders.length, 1)
    const [order] = orders
    assert.equal(order.amountNgn, '1000')
    assert.equal(order.amountUsdc, '0.724222')
    assert.equal(order.bankLast4, '6789')
    assert.equal((order as any).accountIdentifier, undefined)
    assert.equal(order.accountName, 'TEST RECIPIENT')
  } finally {
    if (previousKey === undefined) delete process.env.PAYCREST_API_KEY
    else process.env.PAYCREST_API_KEY = previousKey
  }
})

test('creates a validated Starknet order using the server-verified account name', async () => {
  const previous = {
    key: process.env.PAYCREST_API_KEY,
    enabled: process.env.PHASE0_LIVE_ORDER_ENABLED,
    maximum: process.env.PHASE0_MAX_NGN,
  }
  process.env.PAYCREST_API_KEY = 'test-key'
  process.env.PHASE0_LIVE_ORDER_ENABLED = 'true'
  process.env.PHASE0_MAX_NGN = '3000'
  const calls: Array<{ url: string; body: any }> = []
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, body })
    if (url.endsWith('/v2/verify-account')) {
      return new Response(JSON.stringify({ data: { accountName: 'TEST RECIPIENT' } }), { status: 200 })
    }
    return new Response(JSON.stringify({ data: {
      id: 'order-1', status: 'initiated', amountToPay: '0.75',
      providerAccount: { receiveAddress: '0x123', validUntil: '2030-01-01T00:00:00.000Z' },
    } }), { status: 200 })
  }
  try {
    const order = await createPhase0PaycrestOrder({
      amountNgn: '1000', institution: '058', accountIdentifier: '0123456789',
      refundAddress: '0xabc', confirmation: 'CREATE TEST ORDER',
    }, fakeFetch as typeof fetch)
    assert.equal(order.amountUsdc, '0.75')
    assert.equal(order.receiveAddress, '0x123')
    assert.equal(order.accountName, 'TEST RECIPIENT')
    assert.equal(order.bankLast4, '6789')
    assert.equal(calls[1].body.destination.recipient.accountName, 'TEST RECIPIENT')
    assert.equal(calls[1].body.source.network, 'starknet')
  } finally {
    for (const [key, value] of Object.entries({
      PAYCREST_API_KEY: previous.key,
      PHASE0_LIVE_ORDER_ENABLED: previous.enabled,
      PHASE0_MAX_NGN: previous.maximum,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
