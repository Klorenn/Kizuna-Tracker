import { LOGIN_GENERIC_ERROR, LOGIN_RATE_LIMITED_ERROR, loginWith, type LoginDeps } from '@/lib/login'
import type { WidgetResult } from '@/lib/widget-api'

/**
 * POST /api/m/auth/login's logic, free of Next and Supabase. It runs the same `loginWith` (and limiter) as the web
 * action; `makeDeps` builds the deps around a non-cookie sign-in that hands the new session to `capture`.
 */
export type MobileSession = { access_token: string; refresh_token: string; expires_at: number }

const MAX_IDENTIFIER = 320
/** Matches the longest limiter window; the app shows the web copy and lets the user retry. */
const RETRY_AFTER = 900

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const fail = (status: number, error: string): WidgetResult => ({ status, body: { ok: false, error } })

export async function mobileLogin(
  input: { body: unknown; ip: string | null },
  makeDeps: (capture: (s: MobileSession) => void) => LoginDeps,
): Promise<WidgetResult> {
  const b = input.body
  if (!isRecord(b) || typeof b.identifier !== 'string' || typeof b.password !== 'string' || b.identifier.length > MAX_IDENTIFIER) {
    return fail(400, LOGIN_GENERIC_ERROR)
  }
  let session: MobileSession | null = null
  const res = await loginWith(makeDeps((s) => { session = s }), { identifier: b.identifier, password: b.password }, input.ip)
  if (res.ok) return session ? { status: 200, body: { ok: true, session } } : fail(401, LOGIN_GENERIC_ERROR)
  if (res.error === LOGIN_RATE_LIMITED_ERROR) return { ...fail(429, LOGIN_RATE_LIMITED_ERROR), retryAfter: RETRY_AFTER }
  return fail(401, LOGIN_GENERIC_ERROR)
}
