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
  emailForUsername(username: string): Promise<string | null>
  signInWithPassword(email: string, password: string): Promise<{ ok: boolean }>
}

export type LoginResult = { ok: true } | { ok: false; error: string }

const GENERIC: LoginResult = { ok: false, error: LOGIN_GENERIC_ERROR }

/**
 * Same observable path for unknown users and wrong passwords: an unknown @usuario
 * still performs a sign-in with a throwaway address, and every failure returns the
 * same generic message.
 */
export async function loginWith(
  deps: LoginDeps,
  input: { identifier: string; password: string },
  ip: string,
): Promise<LoginResult> {
  const id = parseIdentifier(input.identifier)
  const keys = [`ip:${ip}`]
  if (id.kind === 'email') keys.unshift(`id:${id.email}`)
  if (id.kind === 'username') keys.unshift(`id:${id.username}`)

  if (!(await deps.registerAttempt(keys))) {
    return { ok: false, error: LOGIN_RATE_LIMITED_ERROR }
  }
  if (id.kind === 'invalid' || typeof input.password !== 'string' || input.password.length > 1024) {
    return GENERIC
  }

  let email: string
  if (id.kind === 'email') {
    email = id.email
  } else {
    email =
      (await deps.emailForUsername(id.username)) ??
      `nobody+${crypto.randomUUID()}@invalid.kizuna`
  }
  const res = await deps.signInWithPassword(email, input.password)
  return res.ok ? { ok: true } : GENERIC
}
