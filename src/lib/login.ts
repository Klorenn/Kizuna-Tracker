import { normalizeUsername } from '@/lib/signup'

export const LOGIN_GENERIC_ERROR = 'Correo, usuario o contraseña incorrectos.'
export const LOGIN_RATE_LIMITED_ERROR =
  'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'

export type Identifier =
  | { kind: 'email'; email: string }
  | { kind: 'username'; username: string }
  | { kind: 'invalid' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9_]{3,20}$/
const MAX_EMAIL = 254

export function parseIdentifier(raw: string): Identifier {
  const v = raw.trim()
  if (v.length === 0) return { kind: 'invalid' }
  if (!v.startsWith('@') && v.includes('@')) {
    const email = v.toLowerCase()
    return email.length <= MAX_EMAIL && EMAIL_RE.test(email)
      ? { kind: 'email', email }
      : { kind: 'invalid' }
  }
  const username = normalizeUsername(v)
  return USERNAME_RE.test(username) ? { kind: 'username', username } : { kind: 'invalid' }
}

export type LoginDeps = {
  registerAttempt(keys: string[]): Promise<boolean>
  /** Resolves an email or @usuario to the auth user (null when unknown). */
  resolveAccount(
    id: { kind: 'email' | 'username'; value: string },
  ): Promise<{ userId: string; email: string } | null>
  signInWithPassword(email: string, password: string): Promise<{ ok: boolean }>
}

export type LoginResult = { ok: true } | { ok: false; error: string }

const GENERIC: LoginResult = { ok: false, error: LOGIN_GENERIC_ERROR }
const LIMITED: LoginResult = { ok: false, error: LOGIN_RATE_LIMITED_ERROR }

/**
 * Same observable path for unknown users and wrong passwords: unknown accounts still
 * count an attempt and perform a sign-in with a throwaway address, and every failure
 * returns the same generic message. Attempts are counted per identifier typed, per IP
 * (when known) and per resolved account, so email and @usuario share one counter.
 * `ip` null (no trustworthy address) skips the IP key instead of sharing a bucket.
 */
export async function loginWith(
  deps: LoginDeps,
  input: { identifier: string; password: string },
  ip: string | null,
): Promise<LoginResult> {
  const id = parseIdentifier(input.identifier)
  const keys: string[] = []
  if (id.kind === 'email') keys.push(`id:${id.email}`)
  if (id.kind === 'username') keys.push(`id:${id.username}`)
  if (ip) keys.push(`ip:${ip}`)

  if (!(await deps.registerAttempt(keys))) return LIMITED
  if (id.kind === 'invalid' || typeof input.password !== 'string' || input.password.length > 1024) {
    return GENERIC
  }

  const value = id.kind === 'email' ? id.email : id.username
  const account = await deps.resolveAccount({ kind: id.kind, value })
  if (!(await deps.registerAttempt([`uid:${account?.userId ?? value}`]))) return LIMITED

  const email =
    account?.email ?? (id.kind === 'email' ? id.email : `nobody+${crypto.randomUUID()}@invalid.kizuna`)
  const res = await deps.signInWithPassword(email, input.password)
  return res.ok ? { ok: true } : GENERIC
}
