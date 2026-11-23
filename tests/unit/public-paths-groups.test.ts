import { describe, expect, it } from 'vitest'
import { decideAccess } from '@/lib/supabase/access'
import { isPublicPath, safeNextPath } from '@/lib/supabase/public-paths'

const CODE = '0123456789abcdef0123456789abcdef'
const GOOD = `/grupos/unirse/${CODE}`

const NOT_THE_SHAPE = [
  ['longer (33)', `${GOOD}0`],
  ['shorter (31)', GOOD.slice(0, -1)],
  ['uppercase', `/grupos/unirse/${CODE.toUpperCase()}`],
  ['mixed case', `/grupos/unirse/A${CODE.slice(1)}`],
  ['trailing slash', `${GOOD}/`],
  ['extra segment', `${GOOD}/extra`],
  ['dot dot', `/grupos/unirse/../${CODE}`],
  ['dot dot after', `${GOOD}/..`],
  ['encoded hex', `/grupos/unirse/%30123456789abcdef0123456789abcdef`],
  ['encoded slash', `/grupos/unirse%2F${CODE}`],
  ['non hex letter', `/grupos/unirse/${CODE.slice(0, -1)}g`],
  ['dash (uuid)', '/grupos/unirse/01234567-89ab-cdef-0123-456789abcdef'],
  ['no code', '/grupos/unirse/'],
  ['no code, no slash', '/grupos/unirse'],
  ['groups root', '/grupos'],
  ['new group', '/grupos/nuevo'],
  ['a group id', '/grupos/01234567-89ab-cdef-0123-456789abcdef'],
  ['a group id, 32 hex', `/grupos/${CODE}`],
  ['other prefix', `/grupos/otro/${CODE}`],
  ['prefix before', `/x/grupos/unirse/${CODE}`],
  ['query in the path', `${GOOD}?a=1`],
  ['hash in the path', `${GOOD}#x`],
  ['newline', `${GOOD}\n`],
  ['backslash', `/grupos\\unirse/${CODE}`],
  ['double slash', `//grupos/unirse/${CODE}`],
  ['plural-ish', `/gruposx/unirse/${CODE}`],
] as const

describe('isPublicPath: group invitation', () => {
  it('the exact shape is public', () => expect(isPublicPath(GOOD)).toBe(true))
  it.each(NOT_THE_SHAPE)('%s is not public', (_name, p) => expect(isPublicPath(p)).toBe(false))
})

describe('safeNextPath: group invitation', () => {
  it('accepts the exact shape', () => expect(safeNextPath(GOOD)).toBe(GOOD))
  it.each(NOT_THE_SHAPE)('%s is not accepted', (_name, p) => expect(safeNextPath(p)).toBe('/'))
})

describe('decideAccess: group invitation', () => {
  const base = { configPresent: true, authError: false }
  it('a signed-out visitor passes on the exact shape', () => {
    expect(decideAccess({ ...base, path: GOOD, user: null })).toEqual({ kind: 'pass' })
  })
  it.each([['/grupos'], ['/grupos/nuevo'], ['/grupos/01234567-89ab-cdef-0123-456789abcdef']])(
    'a signed-out visitor to %s goes to login with no return target',
    (p) => {
      expect(decideAccess({ ...base, path: p, user: null })).toEqual({ kind: 'redirect', to: '/login', search: '' })
    },
  )
})
