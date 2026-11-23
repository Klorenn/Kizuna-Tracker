import { describe, expect, it } from 'vitest'
import { loginAfterSignupHref, postSignupPath, registroHref, returnPathOf } from '@/lib/auth-return'
import { safeNextPath } from '@/lib/supabase/public-paths'

// Friend-invitation tokens: `invites.code` defaults to encode(gen_random_bytes(9), 'hex') (supabase/migrations/0001_schema.sql:43)
// = 18 lower-case hex characters; create_invite (0006) never sets another value.
const MINTED = 'a1b2c3d4e5f60718a9'
const HOSTILE = [
  '/invite/',
  '/invite/..',
  '/invite/../x',
  '/invite/../../hoy',
  '/invite/abc/../x',
  '/invite/./abc',
  '/invite/%2e%2e/x',
  '/invite/abc/',
  '/invite/abc/def',
  '/invite/abc?next=/hoy',
  '/invite/abc?x=1',
  '/invite/abc#frag',
  '/invite/abc#',
  '/invite/abc?',
  '/invite/abc\r\nSet-Cookie: x=1',
  '/invite/abc\n',
  '/invite/abc\r',
  '/invite/abc%0d%0aLocation: https://evil.com',
  '/invite/abc%0D%0A',
  '/invite/abc\\evil',
  '/invite/\\evil.com',
  '/invite/abc def',
  '/invite/ABC', // tokens are lower-case hex
  '/invite/xyz', // not hex
  '/invite/' + 'a'.repeat(33),
  '/invite/' + 'a'.repeat(5000),
  '/invite/abc' + '\u0000',
  '/invite/ábc',
  '//invite/abc',
  '/invite//evil.com',
  'invite/abc',
  'https://evil.com/invite/abc',
]

describe('safeNextPath: friend invitation tokens are exactly the minted shape', () => {
  it.each([MINTED, 'abc', '0'.repeat(32), 'f'.repeat(3)])('/invite/%s is accepted', (t) => expect(safeNextPath(`/invite/${t}`)).toBe(`/invite/${t}`))
  it.each(HOSTILE)('%j is refused', (v) => expect(safeNextPath(v)).toBe('/'))
  it('a trailing slash, a query and a fragment are refused (no caller needs them: pages build /invite/<code> with no suffix)', () => {
    for (const s of ['/', '?a=b', '#x']) expect(safeNextPath(`/invite/${MINTED}${s}`)).toBe('/')
  })
})

describe('the return path that feeds the sign-up redirect and the /registro link', () => {
  it('a minted token travels', () => {
    expect(returnPathOf(`/invite/${MINTED}`)).toBe(`/invite/${MINTED}`)
    expect(postSignupPath(`/invite/${MINTED}`)).toBe(`/invite/${MINTED}`)
    expect(registroHref(`/invite/${MINTED}`)).toBe(`/registro?next=%2Finvite%2F${MINTED}`)
  })
  it.each(HOSTILE)('%j never reaches a redirect or a link', (v) => {
    expect(returnPathOf(v)).toBeNull()
    expect(postSignupPath(v)).toBe('/listo')
    expect(registroHref(v)).toBe('/registro')
    expect(loginAfterSignupHref(v)).toBe('/login?notice=cuenta-lista')
  })
})
