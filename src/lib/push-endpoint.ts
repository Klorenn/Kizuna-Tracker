/** Hosts of the browsers' push services. The server POSTs to whatever endpoint is stored, so
 *  anything outside this list would be an SSRF vector. */
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])
const SUFFIXES = ['.push.apple.com', '.notify.windows.com'] // includes wns2-*.notify.windows.com

const BASE64URL = /^[A-Za-z0-9_-]+$/

export type ParsedSubscription =
  | { ok: true; endpoint: string; p256dh: string; auth: string }
  | { ok: false }

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 2048) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  if (url.port && url.port !== '443') return false
  const host = url.hostname.toLowerCase()
  return EXACT_HOSTS.has(host) || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
}

/** Validates a PushSubscription JSON: allowlisted https endpoint, p256dh 65 bytes, auth 16 bytes (base64url). */
export function parsePushSubscription(body: unknown): ParsedSubscription {
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  const endpoint = b?.endpoint
  const p256dh = b?.keys?.p256dh
  const auth = b?.keys?.auth
  if (typeof endpoint !== 'string' || !isAllowedPushEndpoint(endpoint)) return { ok: false }
  if (typeof p256dh !== 'string' || p256dh.length !== 87 || !BASE64URL.test(p256dh)) return { ok: false }
  if (typeof auth !== 'string' || auth.length < 22 || auth.length > 24 || !BASE64URL.test(auth)) return { ok: false }
  return { ok: true, endpoint, p256dh, auth }
}
