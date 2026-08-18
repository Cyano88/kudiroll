import type { RailTransport } from './contracts'

export function createRailPayRun(transport: RailTransport, input: unknown, key = `kudiroll-client:${crypto.randomUUID()}`) {
  return transport('/api/v1/pay-runs', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) })
}

export function updateRailPayRun(transport: RailTransport, payRunId: string, input: unknown) {
  return transport(`/api/v1/pay-runs/${encodeURIComponent(payRunId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function verifyRailPayRun(transport: RailTransport, payRunId: string) {
  return transport(`/api/v1/pay-runs/${encodeURIComponent(payRunId)}/verify`, { method: 'POST' })
}

export function resolveUnknownRailPayRun(transport: RailTransport, payRunId: string, confirmation: string) {
  return transport(`/api/v1/pay-runs/${encodeURIComponent(payRunId)}/resolve-unknown`, { method: 'POST', body: JSON.stringify({ confirmation }) })
}
