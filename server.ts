import { config } from 'dotenv'
import express from 'express'
import { resolve } from 'node:path'
import { createPhase0Router } from './src/server/phase0-router'
import { createAccountRouter } from './src/server/account-router'
import { createRailRouter } from './src/server/rail-router'
import { databaseReadiness, persistenceConfig } from './src/server/database'
import { bootstrapAccountStore } from './src/server/account-bootstrap'
import { createApiOriginPolicy } from './src/server/origin-policy'
import { createKudiRailProxy, normalizeKudiRailUpstream, readKudiRailHealth } from './src/server/kudirail-proxy'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

await bootstrapAccountStore()

const app = express()
const port = Number(process.env.PORT || 4173)
const host = process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
const kudiRailUpstream = normalizeKudiRailUpstream(process.env.KUDIRAIL_UPSTREAM_URL)

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((_req, res, next) => {
  const connectSources = process.env.NODE_ENV === 'production' ? "'self' https: wss:" : "'self' http: https: ws: wss:"
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'self'; connect-src ${connectSources}; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`)
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})
app.use('/api', createApiOriginPolicy())
app.use(express.json({ limit: '32kb' }))
app.get('/api/health', async (_req, res) => {
  if (kudiRailUpstream) {
    try {
      const rail = await readKudiRailHealth(kudiRailUpstream)
      return res.json({
        ok: true,
        service: 'kudiroll',
        network: 'starknet-mainnet',
        backend: 'kudirail',
        dependency: { service: rail.service, ok: rail.ok, release: rail.release, persistence: rail.persistence },
        release: process.env.KUDIROLL_RELEASE_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'development',
        environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
      })
    } catch {
      return res.status(503).json({ ok: false, service: 'kudiroll', backend: 'kudirail', error: 'KudiRail health check failed.' })
    }
  }
  const persistence = persistenceConfig()
  const database = await databaseReadiness()
  const databaseRequired = persistence.accountBackend === 'postgres' || persistence.authBackend === 'postgres'
  const ready = !databaseRequired || (database.reachable && (database.schemaVersion ?? 0) >= 2)
  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'kudiroll',
    network: 'starknet-mainnet',
    persistence: { accounts: persistence.accountBackend, authentication: persistence.authBackend, database },
    release: process.env.KUDIROLL_RELEASE_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'development',
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
  })
})
if (kudiRailUpstream) {
  const proxy = createKudiRailProxy(kudiRailUpstream)
  app.use(['/api/phase0', '/api/v1', '/api/account'], proxy)
} else {
  app.use('/api/phase0', createPhase0Router())
  app.use('/api/v1', createRailRouter())
  app.use('/api/account', createAccountRouter())
}

if (process.env.NODE_ENV === 'production') {
  const dist = resolve('dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(resolve(dist, 'index.html')))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' })
  app.use(vite.middlewares)
}

app.listen(port, host, () => {
  console.log(`KudiRoll listening on http://${host}:${port}`)
})
