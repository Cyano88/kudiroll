import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { kudiRailUrl, normalizeKudiRailBaseUrl } from '../src/rail/api-origin'
import { createApiOriginPolicy } from '../src/server/origin-policy'

test('KudiRoll resolves only safe KudiRail API origins', () => {
  assert.equal(kudiRailUrl('/api/v1/pay-runs', 'https://api.kudiroll.example/'), 'https://api.kudiroll.example/api/v1/pay-runs')
  assert.equal(kudiRailUrl('/api/account/me', ''), '/api/account/me')
  assert.equal(normalizeKudiRailBaseUrl('http://localhost:5050'), 'http://localhost:5050')
  assert.throws(() => normalizeKudiRailBaseUrl('http://api.kudiroll.example'), /HTTPS/)
  assert.throws(() => normalizeKudiRailBaseUrl('https://api.kudiroll.example/private'), /origin/)
  assert.throws(() => kudiRailUrl('/admin', 'https://api.kudiroll.example'), /versioned \/api path/)
})

test('KudiRail allows credentialed requests only from configured app origins', async () => {
  const app = express()
  app.use('/api', createApiOriginPolicy({ NODE_ENV: 'production', KUDIRAIL_ALLOWED_ORIGINS: 'https://app.kudiroll.example' }))
  app.post('/api/check', (_req, res) => res.json({ ok: true }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  try {
    const port = (server.address() as { port: number }).port
    const allowed = await fetch(`http://127.0.0.1:${port}/api/check`, { method: 'POST', headers: { Origin: 'https://app.kudiroll.example' } })
    assert.equal(allowed.status, 200)
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.kudiroll.example')
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true')
    const preflight = await fetch(`http://127.0.0.1:${port}/api/check`, { method: 'OPTIONS', headers: { Origin: 'https://app.kudiroll.example' } })
    assert.equal(preflight.status, 204)
    const sameOrigin = await fetch(`http://127.0.0.1:${port}/api/check`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${port}` } })
    assert.equal(sameOrigin.status, 200)
    const denied = await fetch(`http://127.0.0.1:${port}/api/check`, { method: 'POST', headers: { Origin: 'https://attacker.example' } })
    assert.equal(denied.status, 403)
    assert.match(String((await denied.json()).error), /not allowed/)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
