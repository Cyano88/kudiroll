import type { RequestHandler } from 'express'

type Fetcher = typeof fetch

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'cookie', 'idempotency-key', 'origin', 'user-agent', 'x-paycrest-signature'] as const
const FORWARDED_RESPONSE_HEADERS = ['cache-control', 'content-type', 'kudiroll-api-version', 'retry-after'] as const

export function normalizeKudiRailUpstream(value: string | undefined) {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  const url = new URL(candidate)
  const localHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) throw new Error('KUDIRAIL_UPSTREAM_URL must use HTTPS outside local development.')
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new Error('KUDIRAIL_UPSTREAM_URL must be an origin without credentials, path, query, or fragment.')
  }
  return url.origin
}

export function resolveKudiRailTarget(upstream: string, originalUrl: string) {
  const base = normalizeKudiRailUpstream(upstream)
  if (!base) throw new Error('KUDIRAIL_UPSTREAM_URL is required for the proxy.')
  const target = new URL(originalUrl, `${base}/`)
  if (target.origin !== base || !/^\/api\/(?:account|v1|phase0)(?:\/|$)/.test(target.pathname)) {
    throw new Error('KudiRail proxy target is outside the allowed API scope.')
  }
  return target
}

export async function readKudiRailHealth(upstream: string, fetcher: Fetcher = fetch) {
  const base = normalizeKudiRailUpstream(upstream)
  if (!base) return null
  const response = await fetcher(`${base}/api/health`, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  const data = await response.json().catch(() => null) as any
  if (!response.ok || data?.ok !== true || data?.service !== 'kudirail') throw new Error('KudiRail health check failed.')
  return data
}

export function createKudiRailProxy(upstream: string, fetcher: Fetcher = fetch): RequestHandler {
  const base = normalizeKudiRailUpstream(upstream)
  if (!base) throw new Error('KUDIRAIL_UPSTREAM_URL is required for the proxy.')
  return async (req, res) => {
    try {
      const target = resolveKudiRailTarget(base, req.originalUrl)
      const headers = new Headers()
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name]
        if (typeof value === 'string' && value) headers.set(name, value)
      }
      if (req.ip) headers.set('x-forwarded-for', req.ip)
      const requestHost = req.get('host')
      if (requestHost) headers.set('x-forwarded-host', requestHost)
      headers.set('x-forwarded-proto', req.protocol)
      const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined
      const body = !hasBody ? undefined : Buffer.isBuffer(req.body) ? Uint8Array.from(req.body) : JSON.stringify(req.body)
      if (body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json')
      const response = await fetcher(target, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      })
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = response.headers.get(name)
        if (value) res.setHeader(name, value)
      }
      const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] }
      const cookies = responseHeaders.getSetCookie?.() || []
      if (cookies.length) res.setHeader('set-cookie', cookies)
      else {
        const cookie = response.headers.get('set-cookie')
        if (cookie) res.setHeader('set-cookie', cookie)
      }
      const payload = Buffer.from(await response.arrayBuffer())
      res.status(response.status)
      if (req.method === 'HEAD' || response.status === 204 || response.status === 304) return res.end()
      res.send(payload)
    } catch {
      res.status(502).json({ ok: false, error: 'KudiRail is temporarily unavailable. Nothing was signed or submitted.' })
    }
  }
}
