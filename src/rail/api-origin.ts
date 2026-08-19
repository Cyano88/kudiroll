const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function normalizeKudiRailBaseUrl(value: string | undefined) {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  const url = new URL(candidate)
  const localHttp = url.protocol === 'http:' && LOCAL_API_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) throw new Error('KudiRail API must use HTTPS outside local development.')
  if (url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new Error('KudiRail API URL must be an origin without credentials, path, query, or fragment.')
  }
  return url.origin
}

export function kudiRailUrl(path: string, configuredBase?: string) {
  if (!/^\/api(?:\/|$)/.test(path)) throw new Error('KudiRail requests must use a versioned /api path.')
  const base = normalizeKudiRailBaseUrl(configuredBase)
  return base ? `${base}${path}` : path
}
