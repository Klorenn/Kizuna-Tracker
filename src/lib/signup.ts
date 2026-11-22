import { isAdult } from '@/domain/age'
import type { LocalDate } from '@/domain/types'

export type SignupInput = {
  firstName: string
  lastName: string
  birthDate: LocalDate
  username: string
  email: string
  password: string
  passwordConfirm: string
  acceptTerms: boolean
  timezone: string
}

export type SignupStep = 1 | 2 | 3 | 4 | 5

export type SignupCheck =
  | { ok: true }
  | { ok: false; field: keyof SignupInput; error: string }

export const MIN_PASSWORD_LENGTH = 8
export const UNDERAGE_ERROR = 'Debes ser mayor de 18 años para usar Kizuna.'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase()
}

function fail(field: keyof SignupInput, error: string): SignupCheck {
  return { ok: false, field, error }
}

function isRealDate(d: string): boolean {
  const m = DATE_RE.exec(d)
  if (!m) return false
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, day))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === day
}

function isValidTimezone(tz: string): boolean {
  return tz === 'UTC' || Intl.supportedValuesOf('timeZone').includes(tz)
}

export function validateSignupStep(
  step: SignupStep,
  input: Partial<SignupInput>,
  today: LocalDate,
): SignupCheck {
  switch (step) {
    case 1: {
      const first = (input.firstName ?? '').trim()
      const last = (input.lastName ?? '').trim()
      if (first.length < 1 || first.length > 40) {
        return fail('firstName', 'Escribe tu nombre (hasta 40 caracteres).')
      }
      if (last.length < 1 || last.length > 40) {
        return fail('lastName', 'Escribe tu apellido (hasta 40 caracteres).')
      }
      return { ok: true }
    }
    case 2: {
      const b = input.birthDate
      if (!b || !isRealDate(b) || b > today) {
        return fail('birthDate', 'Ingresa una fecha de nacimiento válida.')
      }
      if (!isAdult(b, today)) return fail('birthDate', UNDERAGE_ERROR)
      return { ok: true }
    }
    case 3: {
      if (!USERNAME_RE.test(normalizeUsername(input.username ?? ''))) {
        return fail('username', 'Usa de 3 a 20 letras minúsculas, números o _.')
      }
      return { ok: true }
    }
    case 4: {
      if (!EMAIL_RE.test((input.email ?? '').trim())) {
        return fail('email', 'Ingresa un correo válido.')
      }
      return { ok: true }
    }
    case 5: {
      const pw = input.password ?? ''
      if (pw.length < MIN_PASSWORD_LENGTH) {
        return fail('password', `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      }
      if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) {
        return fail('password', 'La contraseña debe incluir una letra y un número.')
      }
      if (pw !== (input.passwordConfirm ?? '')) {
        return fail('passwordConfirm', 'Las contraseñas no coinciden.')
      }
      if (input.acceptTerms !== true) {
        return fail('acceptTerms', 'Debes aceptar los términos para continuar.')
      }
      return { ok: true }
    }
  }
}

export function validateSignup(input: SignupInput, today: LocalDate): SignupCheck {
  for (const step of [1, 2, 3, 4, 5] as const) {
    const r = validateSignupStep(step, input, today)
    if (!r.ok) return r
  }
  if (typeof input.timezone !== 'string' || !isValidTimezone(input.timezone)) {
    return fail('timezone', 'Zona horaria inválida.')
  }
  return { ok: true }
}
