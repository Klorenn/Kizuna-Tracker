import { safeInternalPath } from '@/lib/safe-internal-path'

/**
 * GET /auth/native-handoff logic: where to send the WebView after the one-time token is (or is not) accepted.
 * `verify` is the cookie client's verifyOtp (it sets the session cookies as a side effect). Success goes to the safe
 * `next` path only (else "/"); a malformed, expired or used token goes to /login, which the app reads as "web session expired".
 */
const TOKEN = /^[A-Za-z0-9_-]{8,200}$/

export async function nativeHandoff(
  input: { tokenHash: string | null; next: string | null },
  deps: { verify(tokenHash: string): Promise<boolean> },
): Promise<string> {
  if (!input.tokenHash || !TOKEN.test(input.tokenHash)) return '/login'
  try {
    return (await deps.verify(input.tokenHash)) ? (safeInternalPath(input.next) ?? '/') : '/login'
  } catch {
    return '/login'
  }
}
