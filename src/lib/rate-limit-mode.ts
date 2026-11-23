const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1'])

/**
 * Local development only: requests from this machine (::1 / 127.0.0.1) skip the login and
 * signup limiter, so e2e runs on the shared local DB never lock the owner out. Production
 * (NODE_ENV=production) always enforces it; RATE_LIMIT_ENFORCE=1 forces it locally too.
 */
export function skipRateLimit(ip: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') return false
  if (env.RATE_LIMIT_ENFORCE === '1') return false
  return ip !== null && LOOPBACK.has(ip)
}
