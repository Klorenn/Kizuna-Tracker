/**
 * Bearer auth for the native app's /api/m routes, free of Next and Supabase: the route supplies `verify`
 * (getClaims in production). The user id comes ONLY from the verified token, never from a request field.
 */
const MAX_TOKEN = 4096
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const PREFIX = 'Bearer '

export type VerifiedClaims = { sub: string }
export interface MobileAuthDeps {
  verify(jwt: string): Promise<VerifiedClaims | null>
}
export type RequireUserResult = { ok: true; userId: string; jwt: string } | { ok: false; status: 401 }

/** The JWT of an `Authorization: Bearer <jwt>` header, or null when it is missing, malformed or over 4096 characters. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header?.startsWith(PREFIX)) return null
  const token = header.slice(PREFIX.length)
  return token.length <= MAX_TOKEN && JWT_RE.test(token) ? token : null
}

export async function requireUser(headers: Headers, deps: MobileAuthDeps): Promise<RequireUserResult> {
  const jwt = bearerToken(headers.get('authorization'))
  if (!jwt) return { ok: false, status: 401 }
  try {
    const claims = await deps.verify(jwt)
    return claims?.sub ? { ok: true, userId: claims.sub, jwt } : { ok: false, status: 401 }
  } catch {
    return { ok: false, status: 401 }
  }
}
