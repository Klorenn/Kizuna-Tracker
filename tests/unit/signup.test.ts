import { describe, expect, it } from 'vitest'
import {
  normalizeUsername,
  validateSignup,
  validateSignupStep,
  type SignupInput,
} from '@/lib/signup'

const today = '2026-11-23'
const valid: SignupInput = {
  firstName: 'Pau',
  lastName: 'Koh',
  birthDate: '1998-04-12',
  username: 'pau_k',
  email: 'pau@kizuna.app',
  password: 'kizuna-2026',
  passwordConfirm: 'kizuna-2026',
  acceptTerms: true,
  timezone: 'America/Santiago',
}

describe('validateSignupStep', () => {
  it('step 1 rejects blank names', () => {
    expect(validateSignupStep(1, { firstName: ' ', lastName: 'Koh' }, today)).toMatchObject({
      ok: false,
      field: 'firstName',
    })
    expect(validateSignupStep(1, { firstName: 'Pau', lastName: '' }, today)).toMatchObject({
      ok: false,
      field: 'lastName',
    })
    expect(
      validateSignupStep(1, { firstName: 'a'.repeat(41), lastName: 'Koh' }, today),
    ).toMatchObject({ ok: false, field: 'firstName' })
    expect(validateSignupStep(1, { firstName: 'Pau', lastName: 'Koh' }, today)).toEqual({ ok: true })
  })

  it('step 2 rejects minors with the Figma copy', () => {
    expect(validateSignupStep(2, { birthDate: '2008-11-24' }, today)).toEqual({
      ok: false,
      field: 'birthDate',
      error: 'Debes ser mayor de 18 años para usar Kizuna.',
    })
    expect(validateSignupStep(2, { birthDate: '2008-11-23' }, today)).toEqual({ ok: true })
  })

  it('step 2 rejects impossible dates', () => {
    for (const birthDate of ['2026-13-01', '2001-02-30', '2999-01-01', undefined]) {
      expect(validateSignupStep(2, { birthDate }, today)).toMatchObject({
        ok: false,
        field: 'birthDate',
      })
    }
  })

  it('step 3 validates username format', () => {
    expect(validateSignupStep(3, { username: 'Pau!' }, today)).toMatchObject({
      ok: false,
      field: 'username',
    })
    expect(validateSignupStep(3, { username: 'ab' }, today)).toMatchObject({
      ok: false,
      field: 'username',
    })
    expect(validateSignupStep(3, { username: '@pau_k' }, today)).toEqual({ ok: true })
  })

  it('step 3 refuses the deleted_ prefix, reserved for deleted accounts', () => {
    expect(validateSignupStep(3, { username: 'deleted_0123456789ab' }, today)).toEqual({
      ok: false,
      field: 'username',
      error: 'Ese usuario no está disponible.',
    })
    expect(validateSignupStep(3, { username: '@Deleted_x' }, today)).toMatchObject({ ok: false, field: 'username' })
    expect(validateSignupStep(3, { username: 'undeleted_x' }, today)).toEqual({ ok: true })
  })

  it('step 4 validates email', () => {
    expect(validateSignupStep(4, { email: 'pau@' }, today)).toMatchObject({
      ok: false,
      field: 'email',
    })
    expect(validateSignupStep(4, { email: 'pau@kizuna.app' }, today)).toEqual({ ok: true })
  })

  it('step 5 validates password, confirmation and terms', () => {
    expect(
      validateSignupStep(5, { password: 'corta12', passwordConfirm: 'corta12', acceptTerms: true }, today),
    ).toMatchObject({ ok: false, field: 'password' })
    expect(
      validateSignupStep(
        5,
        { password: 'kizuna-2026', passwordConfirm: 'kizuna-2027', acceptTerms: true },
        today,
      ),
    ).toEqual({ ok: false, field: 'passwordConfirm', error: 'Las contraseñas no coinciden.' })
    expect(
      validateSignupStep(
        5,
        { password: 'kizuna-2026', passwordConfirm: 'kizuna-2026', acceptTerms: false },
        today,
      ),
    ).toMatchObject({ ok: false, field: 'acceptTerms' })
    expect(
      validateSignupStep(
        5,
        { password: 'kizuna-2026', passwordConfirm: 'kizuna-2026', acceptTerms: true },
        today,
      ),
    ).toEqual({ ok: true })
  })
})

describe('validateSignup', () => {
  it('accepts a complete valid input', () => {
    expect(validateSignup(valid, today)).toEqual({ ok: true })
  })
  it('rejects an unknown timezone', () => {
    expect(validateSignup({ ...valid, timezone: 'Mars/Base' }, today)).toMatchObject({
      ok: false,
      field: 'timezone',
    })
  })
  it('reports the first failing step', () => {
    expect(
      validateSignup({ ...valid, birthDate: '2015-01-01', email: 'x' }, today),
    ).toMatchObject({ ok: false, field: 'birthDate' })
  })
})

describe('normalizeUsername', () => {
  it('trims, strips @ and lowercases', () => {
    expect(normalizeUsername('  @Pau_K ')).toBe('pau_k')
  })
})
