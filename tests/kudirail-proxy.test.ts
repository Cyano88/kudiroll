import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { createKudiRailProxy, normalizeKudiRailUpstream, readKudiRailHealth, resolveKudiRailTarget } from '../src/server/kudirail-proxy'

async function listen(app: ReturnType<typeof express>) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  return { server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` }
}

test('validates a KudiRail upstream origin', () => {
  assert.equal(normalizeKudiRailUpstream('https://kudirail.example/'), 'https://kudirail.example')
  assert.equal(normalizeKudiRailUpstream('http://localhost:4174'), 'http://localhost:4174')
  assert.throws(() => normalizeKudiRailUpstream('http://kudirail.example'), /HTTPS/)
  assert.throws(() => normalizeKudiRailUpstream('https://kudirail.example/api'), /origin/)
  assert.equal(resolveKudiRailTarget('https://kudirail.example', '/api/v1/pay-runs?limit=1').href, 'https://kudirail.example/api/v1/pay-runs?limit=1')
  assert.throws(() => resolveKudiRailTarget('https://kudirail.example', '//attacker.example/api/v1/pay-runs'), /outside/)
  assert.throws(() => resolveKudiRailTarget('https://kudirail.example', '/api/health'), /outside/)
})

test('proxies JSON, cookies, idempotency, origin, status and response cookies without signing authority', async () => {
  const upstreamApp = express()
  upstreamApp.use(express.json())
  upstreamApp.post('/api/v1/echo', (req, res) => {
    res.setHeader('KudiRoll-API-Version', '1')
    res.setHeader('Set-Cookie', '__Host-kudiroll_session=replaced; HttpOnly; Secure; SameSite=Strict; Path=/')
    res.status(201).json({
      body: req.body,
      cookie: req.headers.cookie,
      idempotencyKey: req.headers['idempotency-key'],
      origin: req.headers.origin,
      hasAuthorization: Boolean(req.headers.authorization),
    })
  })
  const upstream = await listen(upstreamApp)
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createKudiRailProxy(upstream.origin))
  const proxy = await listen(app)
  try {
    const response = await fetch(`${proxy.origin}/api/v1/echo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-kudiroll_session=existing',
        'Idempotency-Key': 'proxy-contract-key-0001',
        Origin: 'https://kudiroll.example',
        Authorization: 'Bearer must-not-forward',
      },
      body: JSON.stringify({ payRunId: 'run-1', serverCanSubmit: false }),
    })
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('kudiroll-api-version'), '1')
    assert.match(String(response.headers.get('set-cookie')), /__Host-kudiroll_session=replaced/)
    const data = await response.json()
    assert.deepEqual(data.body, { payRunId: 'run-1', serverCanSubmit: false })
    assert.equal(data.cookie, '__Host-kudiroll_session=existing')
    assert.equal(data.idempotencyKey, 'proxy-contract-key-0001')
    assert.equal(data.origin, 'https://kudiroll.example')
    assert.equal(data.hasAuthorization, false)
  } finally {
    await Promise.all([
      new Promise<void>((resolve, reject) => proxy.server.close(error => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => upstream.server.close(error => error ? reject(error) : resolve())),
    ])
  }
})

test('reads only a valid KudiRail health response and fails closed upstream', async () => {
  const healthy = await readKudiRailHealth('https://kudirail.example', async () => new Response(JSON.stringify({ ok: true, service: 'kudirail', release: 'abc' }), { status: 200, headers: { 'Content-Type': 'application/json' } }) as never)
  assert.equal(healthy.release, 'abc')
  await assert.rejects(readKudiRailHealth('https://kudirail.example', async () => new Response(JSON.stringify({ ok: true, service: 'other' }), { status: 200 }) as never), /health check failed/)

  const app = express()
  app.use(express.json())
  app.use('/api/v1', createKudiRailProxy('https://kudirail.example', async () => { throw new Error('offline') }))
  const proxy = await listen(app)
  try {
    const response = await fetch(`${proxy.origin}/api/v1/pay-runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(response.status, 502)
    assert.match(String((await response.json()).error), /Nothing was signed or submitted/)
  } finally {
    await new Promise<void>((resolve, reject) => proxy.server.close(error => error ? reject(error) : resolve()))
  }
})
