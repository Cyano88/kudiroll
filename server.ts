import { config } from 'dotenv'
import express from 'express'
import { resolve } from 'node:path'
import { createPhase0Router } from './src/server/phase0-router'
import { createAccountRouter } from './src/server/account-router'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const app = express()
const port = Number(process.env.PORT || 4173)
const host = process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')

app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  next()
})
app.use(express.json({ limit: '32kb' }))
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'kudiroll',
  network: 'starknet-mainnet',
  persistence: process.env.KUDIROLL_DATA_FILE ? 'configured-file' : 'local-file',
  release: process.env.KUDIROLL_RELEASE_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'development',
  environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
}))
app.use('/api/phase0', createPhase0Router())
app.use('/api/account', createAccountRouter())

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
