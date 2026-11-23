import { describe, expect, it } from 'vitest'
import { loginAfterSignupHref, postSignupPath, registroHref, returnPathOf } from '@/lib/auth-return'

const GOOD = '/g/K7QM4PXD'
const HOSTILE = [
  'https://evil.com',
  '//evil.com',
  '//evil.com/g/K7QM4PXD',
  '\\\\evil.com',
  '/\\evil.com',
  'javascript:alert(1)',
  '/g/K7QM4PXD/../../x',
  '/g/k7qm4pxd', // only the canonical shape is a return target
  '/g/K7QM-4PXD',
  '/hoy',
  '/grupos/abc',
  '/@Bad',
  '',
  ' ',
  null,
  undefined,
]

describe('returnPathOf', () => {
  it('keeps what safeNextPath accepts', () => {
    expect(returnPathOf(GOOD)).toBe(GOOD)
    expect(returnPathOf('/invite/abc')).toBe('/invite/abc')
    expect(returnPathOf('/@pau_k')).toBe('/@pau_k')
  })
  it.each(HOSTILE)('%j is no return path', (v) => expect(returnPathOf(v)).toBeNull())
  it('"/" (the fallback itself) is no return path', () => expect(returnPathOf('/')).toBeNull())
})

describe('registroHref (login -> registro)', () => {
  it('carries the invitation, encoded', () => expect(registroHref(GOOD)).toBe('/registro?next=%2Fg%2FK7QM4PXD'))
  it('no return path: the bare link, as today', () => {
    expect(registroHref(null)).toBe('/registro')
    expect(registroHref('/')).toBe('/registro')
  })
  it.each(HOSTILE)('hostile %j never reaches the link', (v) => expect(registroHref(v)).toBe('/registro'))
})

describe('postSignupPath (where sign-up ends)', () => {
  it('back to the invitation', () => expect(postSignupPath(GOOD)).toBe(GOOD))
  it('no return path: /listo, as today', () => {
    expect(postSignupPath(null)).toBe('/listo')
    expect(postSignupPath(undefined)).toBe('/listo')
  })
  it.each(HOSTILE)('hostile %j ends on /listo', (v) => expect(postSignupPath(v)).toBe('/listo'))
  it('always a same-origin path', () => {
    for (const v of [GOOD, ...HOSTILE]) expect(postSignupPath(v)).toMatch(/^\/(?!\/)[^\\]*$/)
  })
})

describe('loginAfterSignupHref (account created, session not opened)', () => {
  it('keeps the invitation', () => expect(loginAfterSignupHref(GOOD)).toBe('/login?notice=cuenta-lista&next=%2Fg%2FK7QM4PXD'))
  it.each([null, ...HOSTILE])('no or hostile return path (%j): as today', (v) => expect(loginAfterSignupHref(v)).toBe('/login?notice=cuenta-lista'))
})
