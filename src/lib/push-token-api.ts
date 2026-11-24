import type { WidgetResult } from '@/lib/widget-api'

/**
 * POST/DELETE /api/m/push-token logic, free of Next and Supabase (the route supplies the store). The user id
 * is the verified JWT's, never a body field. Registering is an upsert on the token: a device that signs into
 * another account moves to it, and a rotated token is just a new row (the old one is purged by receipts).
 */
export interface PushTokenDeps {
  upsertToken(userId: string, token: string): Promise<void>
  deleteToken(userId: string, token: string): Promise<void>
  /** false when the per-user limit is exceeded or the limiter is down (fail closed) */
  registerAttempt(key: string): Promise<boolean>
  /** keeps the `max` most recently seen tokens of the user, deleting the rest */
  trimTokens(userId: string, max: number): Promise<void>
}

export const MAX_TOKENS_PER_USER = 10
const RETRY_AFTER = 900

// Same shape the device_push_tokens check constraint enforces.
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/

export const isExpoPushToken = (v: unknown): v is string => typeof v === 'string' && EXPO_TOKEN.test(v)

const bodyToken = (body: unknown): string | null =>
  typeof body === 'object' && body !== null && !Array.isArray(body) && isExpoPushToken((body as Record<string, unknown>).token)
    ? ((body as Record<string, unknown>).token as string)
    : null

const OK: WidgetResult = { status: 200, body: { ok: true } }
const INVALID: WidgetResult = { status: 400, body: { ok: false, error: 'invalid' } }
const UNAVAILABLE: WidgetResult = { status: 500, body: { ok: false, error: 'unavailable' } }

export async function registerPushToken(input: { body: unknown; userId: string }, deps: PushTokenDeps): Promise<WidgetResult> {
  const token = bodyToken(input.body)
  if (!token) return INVALID
  try {
    if (!(await deps.registerAttempt(`chk:push:${input.userId}`))) {
      return { status: 429, body: { ok: false, error: 'rate_limited' }, retryAfter: RETRY_AFTER }
    }
    await deps.upsertToken(input.userId, token)
    await deps.trimTokens(input.userId, MAX_TOKENS_PER_USER)
    return OK
  } catch {
    return UNAVAILABLE
  }
}

export async function removePushToken(input: { body: unknown; userId: string }, deps: PushTokenDeps): Promise<WidgetResult> {
  const token = bodyToken(input.body)
  if (!token) return INVALID
  try {
    await deps.deleteToken(input.userId, token)
    return OK
  } catch {
    return UNAVAILABLE
  }
}
