import { timingSafeEqual } from 'node:crypto'

// The vault secret that 0020 generates is 64 hex characters (32 random bytes).
const DB_SECRET_SHAPE = /^[0-9a-f]{64}$/

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

function matchesEnvSecret(token: string): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The database compares digests of the presented token and the vault secret. Any failure is "no". */
async function matchesDatabaseSecret(token: string): Promise<boolean> {
  if (!DB_SECRET_SHAPE.test(token)) return false
  try {
    // loaded on demand: the admin client is server-only and the env-secret path never needs it
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data, error } = await createAdminClient().rpc('cron_secret_valid', { p_secret: token })
    if (error) {
      console.error('cron auth: cron_secret_valid failed:', error.message)
      return false
    }
    return data === true
  } catch (e) {
    console.error('cron auth: database check threw:', e instanceof Error ? e.message : 'unknown error')
    return false
  }
}

/**
 * `Authorization: Bearer <secret>` check shared by every /api/cron route. Accepted when the token
 * equals the CRON_SECRET env var (constant-time) or, for a 64-hex token, when the database's own
 * vault secret says so (`cron_secret_valid`). Anything else, including a failing database, is a no.
 * Async on purpose: callers must `await` it.
 */
export async function authorizeCronRequest(request: Request): Promise<boolean> {
  const token = bearerToken(request)
  if (token === null) return false
  if (matchesEnvSecret(token)) return true
  return matchesDatabaseSecret(token)
}
