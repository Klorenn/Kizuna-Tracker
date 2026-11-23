const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1'])

/**
 * Allowlist, local development only: `next dev` (NODE_ENV=development), not on Vercel, against a
 * LOCAL Supabase, for a loopback client. Then the login/signup limiter is skipped so e2e runs on
 * the shared local DB never lock the owner out. Everything else enforces it (test, staging,
 * production, unset NODE_ENV, a tunnel to a remote Supabase, RATE_LIMIT_ENFORCE=1): the IP comes
 * from client-settable headers, so the other conditions are what make spoofing it harmless.
 */
export function skipRateLimit(ip: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'development') return false
  if (env.VERCEL || env.RATE_LIMIT_ENFORCE === '1') return false
  const host = (() => {
    try {
      return new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname
    } catch {
      return ''
    }
  })()
  if (host !== '127.0.0.1' && host !== 'localhost') return false
  return ip !== null && LOOPBACK.has(ip)
}
