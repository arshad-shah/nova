import { recordActivity } from './recorder'
import { errorMessage } from '@shared/errors'
import { ACTIVITY_KIND } from '@shared/activity'

/**
 * fetch() wrapper that records a `network` activity entry. Records only method,
 * host+path, status and timing — never request/response bodies or auth headers,
 * which carry secrets.
 */
export async function tracedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  let host: string | undefined
  let path = raw
  try { const u = new URL(raw); host = u.host; path = `${u.host}${u.pathname}` } catch { /* keep raw */ }
  const start = Date.now()
  try {
    const res = await fetch(input, init)
    recordActivity({
      kind: ACTIVITY_KIND.NETWORK,
      level: res.ok ? 'info' : 'warn',
      title: `${method} ${path} · ${res.status}`,
      source: host,
      durationMs: Date.now() - start,
      metadata: { method, url: path, status: res.status },
    })
    return res
  } catch (err) {
    recordActivity({
      kind: ACTIVITY_KIND.NETWORK,
      level: 'error',
      title: `${method} ${path} failed`,
      source: host,
      durationMs: Date.now() - start,
      detail: errorMessage(err),
      stack: err instanceof Error ? err.stack : undefined,
      metadata: { method, url: path },
    })
    throw err
  }
}
