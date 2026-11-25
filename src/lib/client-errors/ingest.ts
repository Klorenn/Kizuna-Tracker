import { fingerprint } from './fingerprint'
import { isNoise } from './noise'
import { MAX_BODY_BYTES, parseUa, validatePayload } from './payload'

export type ErrorRow = {
  user_id: string | null
  kind: string
  message: string
  stack: string | null
  url_path: string
  ua_kind: 'native' | 'browser'
  app_version: string | null
  release: string | null
  fingerprint: string
}

export interface IngestDeps {
  /** True when the bucket is over its limit. A rejection means the limiter itself failed. */
  limited(a: { key: string; limit: number; windowSeconds: number }): Promise<boolean>
  record(row: ErrorRow): Promise<void>
}

/** Per ip bucket and per user, in their own key family. */
const IP_LIMIT = { limit: 30, windowSeconds: 600 }
const USER_LIMIT = { limit: 60, windowSeconds: 600 }

/**
 * The whole pipeline behind POST /api/client-errors, free of Next and Supabase. It never throws and never reports:
 * the route answers 204 whatever happens here. The user id is an argument (from the cookie session), never a body field.
 */
export async function ingestClientError(
  deps: IngestDeps,
  input: { rawBody: string; ipBucket: string; userId: string | null; ua: string | null; release: string | null },
): Promise<void> {
  try {
    if (input.rawBody.length > MAX_BODY_BYTES) return
    let json: unknown
    try {
      json = JSON.parse(input.rawBody)
    } catch {
      return
    }
    const v = validatePayload(json)
    if (!v.ok) return
    const e = v.value
    if (isNoise({ message: e.message, stack: e.stack })) return

    const checks = [{ key: `cerr:ip:${input.ipBucket}`, ...IP_LIMIT }]
    if (input.userId) checks.push({ key: `cerr:user:${input.userId}`, ...USER_LIMIT })
    for (const c of checks) {
      // fail open: only when the limiter itself errors, never because the answer was "limited"
      const limited = await deps.limited(c).catch(() => false)
      if (limited) return
    }

    const ua = parseUa(input.ua)
    await deps.record({
      user_id: input.userId,
      kind: e.kind,
      message: e.message,
      stack: e.stack,
      url_path: e.path,
      ua_kind: ua.uaKind,
      app_version: ua.appVersion,
      release: input.release,
      fingerprint: fingerprint(e),
    })
  } catch (err) {
    console.error('client-errors: ingest failed:', err instanceof Error ? err.message : 'unknown error')
  }
}
