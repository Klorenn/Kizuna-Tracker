import { describe, expect, it } from 'vitest'
import { decideAccess } from '@/lib/supabase/access'
import { isPublicPath, safeNextPath } from '@/lib/supabase/public-paths'

const CODE = 'K7QM4PXD'
const GOOD = `/g/${CODE}`
const PUBLIC_VARIANTS = [GOOD, '/g/k7qm4pxd', '/g/K7QM-4PXD', '/g/k7qm-4pxd', '/g/K7qm-4pXD']

const NOT_THE_SHAPE = [
  ['9 characters', `${GOOD}D`],
  ['7 characters', GOOD.slice(0, -1)],
  ['0', '/g/K7QM4PX0'],
  ['1', '/g/K7QM4PX1'],
  ['I', '/g/K7QM4PXI'],
  ['O', '/g/K7QMOPXD'],
  ['lowercase i', '/g/k7qm4pxi'],
  ['two hyphens', '/g/K7QM--4PXD'],
  ['hyphen elsewhere', '/g/K7Q-M4PXD'],
  ['hyphen at the end', '/g/K7QM4PXD-'],
  ['trailing slash', `${GOOD}/`],
  ['extra segment', `${GOOD}/extra`],
  ['dot dot', `/g/../${CODE}`],
  ['dot dot after', `${GOOD}/..`],
  ['encoded letter', '/g/%4B7QM4PXD'],
  ['encoded hyphen', '/g/K7QM%2D4PXD'],
  ['encoded slash', `/g%2F${CODE}`],
  ['underscore', '/g/K7QM_4PXD'],
  ['no code', '/g/'],
  ['no code, no slash', '/g'],
  ['groups root', '/grupos'],
  ['new group', '/grupos/nuevo'],
  ['a group id', '/grupos/01234567-89ab-cdef-0123-456789abcdef'],
  ['the old invitation path', `/grupos/unirse/${CODE}`],
  ['the old 32 hex path', `/grupos/unirse/${'a'.repeat(32)}`],
  ['other prefix', `/g/x/${CODE}`],
  ['prefix before', `/x/g/${CODE}`],
  ['look-alike prefix', `/gx/${CODE}`],
  ['query in the path', `${GOOD}?a=1`],
  ['hash in the path', `${GOOD}#x`],
  ['newline', `${GOOD}\n`],
  ['backslash', `/g\\${CODE}`],
  ['double slash', `//g/${CODE}`],
] as const

describe('isPublicPath: group invitation', () => {
  it.each(PUBLIC_VARIANTS)('%s is public', (p) => expect(isPublicPath(p)).toBe(true))
  it.each(NOT_THE_SHAPE)('%s is not public', (_name, p) => expect(isPublicPath(p)).toBe(false))
})

describe('safeNextPath: group invitation', () => {
  it('accepts the canonical shape', () => expect(safeNextPath(GOOD)).toBe(GOOD))
  it.each(PUBLIC_VARIANTS.slice(1))('%s is public but not a next target (only the canonical shape)', (p) => expect(safeNextPath(p)).toBe('/'))
  it.each(NOT_THE_SHAPE)('%s is not accepted', (_name, p) => expect(safeNextPath(p)).toBe('/'))
})

describe('decideAccess: group invitation', () => {
  const base = { configPresent: true, authError: false }
  it('a signed-out visitor passes on the shape', () => {
    expect(decideAccess({ ...base, path: GOOD, user: null })).toEqual({ kind: 'pass' })
  })
  it.each([['/grupos'], ['/grupos/nuevo'], ['/grupos/01234567-89ab-cdef-0123-456789abcdef'], [`/grupos/unirse/${CODE}`]])(
    'a signed-out visitor to %s goes to login with no return target',
    (p) => {
      expect(decideAccess({ ...base, path: p, user: null })).toEqual({ kind: 'redirect', to: '/login', search: '' })
    },
  )
})
