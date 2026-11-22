const MAX_IP_LENGTH = 45 // longest textual IPv6

/**
 * Client address for rate limiting. Prefers headers set by the platform edge
 * (x-vercel-forwarded-for, x-real-ip) over the client-appendable x-forwarded-for.
 * Returns null when nothing usable is present: callers must then skip IP keys
 * rather than share one bucket.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const candidates = [
    headers.get('x-vercel-forwarded-for'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0] ?? null,
  ]
  for (const raw of candidates) {
    const v = raw?.split(',')[0]?.trim()
    if (v && v.length <= MAX_IP_LENGTH) return v
  }
  return null
}
