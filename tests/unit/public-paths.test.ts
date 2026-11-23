import { describe, expect, it } from 'vitest'
import { isPublicPath, safeNextPath } from '@/lib/supabase/public-paths'

describe('isPublicPath', () => {
  it.each(['/bienvenida', '/login', '/registro', '/legal/terminos', '/invite/abc', '/u/pau_k', '/@pau_k', '/api/cron/close-periods'])(
    '%s is public',
    (p) => expect(isPublicPath(p)).toBe(true),
  )
  it.each(['/registros', '/loginfoo', '/hoy', '/', '/auth/callback', '/authx', '/invites', '/bienvenidas'])(
    '%s is not public',
    (p) => expect(isPublicPath(p)).toBe(false),
  )
})

describe('health endpoint', () => {
  it('/api/health is public', () => expect(isPublicPath('/api/health')).toBe(true))
  it('/api/healthz is not', () => expect(isPublicPath('/api/healthz')).toBe(false))
})

describe('safeNextPath', () => {
  it('accepts invite and handle paths only', () => {
    expect(safeNextPath('/invite/abc')).toBe('/invite/abc')
    expect(safeNextPath('/@pau_k')).toBe('/@pau_k')
    expect(safeNextPath('/@../x')).toBe('/')
    expect(safeNextPath('/@pau_k/extra')).toBe('/')
    expect(safeNextPath('/@Pau')).toBe('/')
    expect(safeNextPath('//evil.com')).toBe('/')
    expect(safeNextPath('https://evil.com')).toBe('/')
    expect(safeNextPath('/hoy')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })
})
