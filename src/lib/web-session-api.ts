import { safeInternalPath } from '@/lib/safe-internal-path'
import type { WidgetResult } from '@/lib/widget-api'

/**
 * POST /api/m/web-session logic, free of Next and Supabase. The native app asks for a one-time URL that signs its
 * WebView into the web as the SAME user (the verified JWT's), landing on `path`. The limiter key is in the 60 per 15
 * minutes `chk:` family (a person moving between web screens must not trip the 10 per 15 minutes login bucket).
 */
export interface WebSessionDeps {
  /** false when the limit is exceeded or the limiter is down (fail closed) */
  registerAttempt(key: string): Promise<boolean>
  /** the hashed magic-link token of that user's account (no email is sent), or null */
  hashedTokenFor(userId: string): Promise<string | null>
}

const RETRY_AFTER = 900

export async function webSession(input: { body: unknown; userId: string; origin: string }, deps: WebSessionDeps): Promise<WidgetResult> {
  const raw = typeof input.body === 'object' && input.body !== null ? (input.body as Record<string, unknown>).path : null
  const path = safeInternalPath(raw)
  if (!path) return { status: 400, body: { ok: false, error: 'invalid' } }
  try {
    if (!(await deps.registerAttempt(`chk:handoff:${input.userId}`))) {
      return { status: 429, body: { ok: false, error: 'rate_limited' }, retryAfter: RETRY_AFTER }
    }
    const tokenHash = await deps.hashedTokenFor(input.userId)
    if (!tokenHash) return { status: 500, body: { ok: false, error: 'unavailable' } }
    const url = `${input.origin}/auth/native-handoff?token_hash=${encodeURIComponent(tokenHash)}&next=${encodeURIComponent(path)}`
    return { status: 200, body: { ok: true, url } }
  } catch {
    return { status: 500, body: { ok: false, error: 'unavailable' } }
  }
}
