import { isUuid } from '@/domain/groups'
import type { WidgetPayload } from '@/domain/widget-payload'
import { WIDGET_TOKEN_RE, bearerToken, generateWidgetToken, hashWidgetToken } from '@/lib/widget-token'

/**
 * The widget API's logic, free of Next and Supabase: the routes parse the request, call these and write the answer.
 * The user id comes ONLY from `deps.auth` (the token row), never from a request field.
 */
export type AuthResult = { status: 'ok'; userId: string; tokenId: string; timeZone: string } | { status: 'invalid' } | { status: 'limited' }
export type PairResult = { status: 'ok'; username: string } | { status: 'invalid' } | { status: 'limited' } | { status: 'limit_reached' }
export type CheckinResult = { ok: true; created: boolean } | { ok: false; message: string }

export interface WidgetDeps {
  auth(a: { tokenHash: string; ipKey: string | null; scope: 'today' | 'checkin' }): Promise<AuthResult>
  pair(a: { code: string; tokenHash: string; label: string | null; previousTokenHash: string | null; ipKey: string | null }): Promise<PairResult>
  loadToday(userId: string, timeZone: string): Promise<WidgetPayload | null>
  checkin(userId: string, habitId: string): Promise<CheckinResult>
}

export type WidgetResult = {
  status: number
  body: unknown
  /** Seconds, for the Retry-After header of a 429. */
  retryAfter?: number
  /** Paths to revalidate: only after a successful check-in. */
  revalidate?: string[]
}

/** The shortest limiter window is 10 minutes and the longest 1 hour; the widget retries on its own 30-minute refresh. */
const RETRY_AFTER = 900

const UNAUTHORIZED: WidgetResult = { status: 401, body: { error: 'unauthorized' } }
const INVALID: WidgetResult = { status: 400, body: { error: 'invalid' } }
const FAILED: WidgetResult = { status: 502, body: { error: 'failed' } }
const LIMITED: WidgetResult = { status: 429, body: { error: 'rate_limited' }, retryAfter: RETRY_AFTER }

/** SQL exceptions of create_checkin that mean "this habit cannot be toggled from the widget". */
const UNSUPPORTED = new Set(['habit_not_found', 'quantity_habit', 'habit_has_items', 'photo_required', 'widget_unsupported'])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export async function widgetPair(deps: WidgetDeps, input: { body: unknown; ipKey: string | null }): Promise<WidgetResult> {
  const b = input.body
  if (!isRecord(b)) return INVALID
  if (typeof b.code !== 'string' || b.code.length === 0 || b.code.length > 32) return INVALID
  if (b.label !== undefined && b.label !== null && typeof b.label !== 'string') return INVALID
  const prev = b.previousToken
  if (prev !== undefined && prev !== null && !(typeof prev === 'string' && WIDGET_TOKEN_RE.test(prev))) return INVALID
  const token = generateWidgetToken()
  try {
    const r = await deps.pair({
      code: b.code,
      tokenHash: hashWidgetToken(token),
      label: typeof b.label === 'string' ? b.label : null,
      previousTokenHash: typeof prev === 'string' ? hashWidgetToken(prev) : null,
      ipKey: input.ipKey,
    })
    if (r.status === 'ok') return { status: 200, body: { token, username: r.username } }
    if (r.status === 'invalid') return { status: 400, body: { error: 'invalid_code' } }
    if (r.status === 'limit_reached') return { status: 409, body: { error: 'limit_reached' } }
    return LIMITED
  } catch {
    return FAILED
  }
}

type Authed = { ok: true; userId: string; timeZone: string } | { ok: false; result: WidgetResult }

async function authenticate(deps: WidgetDeps, authorization: string | null, ipKey: string | null, scope: 'today' | 'checkin'): Promise<Authed> {
  const token = bearerToken(authorization)
  if (!token) return { ok: false, result: UNAUTHORIZED }
  try {
    const a = await deps.auth({ tokenHash: hashWidgetToken(token), ipKey, scope })
    if (a.status === 'ok') return { ok: true, userId: a.userId, timeZone: a.timeZone }
    return { ok: false, result: a.status === 'limited' ? LIMITED : UNAUTHORIZED }
  } catch {
    return { ok: false, result: FAILED }
  }
}

export async function widgetToday(deps: WidgetDeps, input: { authorization: string | null; ipKey: string | null }): Promise<WidgetResult> {
  const a = await authenticate(deps, input.authorization, input.ipKey, 'today')
  if (!a.ok) return a.result
  try {
    const payload = await deps.loadToday(a.userId, a.timeZone)
    return payload ? { status: 200, body: payload } : FAILED
  } catch {
    return FAILED
  }
}

export async function widgetCheckin(
  deps: WidgetDeps,
  input: { authorization: string | null; ipKey: string | null; body: unknown },
): Promise<WidgetResult> {
  const a = await authenticate(deps, input.authorization, input.ipKey, 'checkin')
  if (!a.ok) return a.result
  if (!isRecord(input.body) || !isUuid(input.body.habitId)) return INVALID
  const habitId = input.body.habitId
  try {
    const r = await deps.checkin(a.userId, habitId)
    if (!r.ok) {
      if (r.message === 'not_authenticated') return UNAUTHORIZED
      return UNSUPPORTED.has(r.message) ? { status: 422, body: { error: 'unsupported' } } : FAILED
    }
    // the check-in is done: a failed re-read must not turn it into an error
    const today = await deps.loadToday(a.userId, a.timeZone).catch(() => null)
    return { status: 200, body: { created: r.created, today }, revalidate: ['/', `/habitos/${habitId}`] }
  } catch {
    return FAILED
  }
}
