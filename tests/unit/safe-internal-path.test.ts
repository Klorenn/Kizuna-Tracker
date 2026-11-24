import { describe, expect, it } from 'vitest'
import { safeInternalPath } from '@/lib/safe-internal-path'

describe('safeInternalPath', () => {
  it('accepts same-origin relative app paths', () => {
    for (const p of ['/', '/retos', '/retos/123', '/perfil/ajustes', '/@pau', '/grupos/9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b?seccion=fondo', '/u/some.name_1-x'])
      expect(safeInternalPath(p)).toBe(p)
  })
  it('rejects anything that could leave the origin', () => {
    for (const p of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '/a//b', 'retos', '', '/%2F%2Fevil.com'])
      expect(safeInternalPath(p)).toBeNull()
  })
  it('rejects dot segments, fragments, control characters and spaces', () => {
    for (const p of ['/a/../b', '/..', '/a/./b', '/x#frag', '/x\n', '/x y', '/x\u0000'])
      expect(safeInternalPath(p)).toBeNull()
  })
  it('rejects a path or query over the limits', () => {
    expect(safeInternalPath(`/retos/${'a'.repeat(504)}`)).toBe(`/retos/${'a'.repeat(504)}`)
    expect(safeInternalPath(`/retos/${'a'.repeat(506)}`)).toBeNull()
    expect(safeInternalPath(`/x?${'a'.repeat(129)}`)).toBeNull()
  })
  it('only the web app pages are allowed: never /auth, /api, the login or any other route', () => {
    for (const p of ['/auth/native-handoff?token_hash=abc123', '/auth/x', '/api/m/web-session', '/api/cron/reminders', '/login', '/serwist/sw.js', '/robots.txt', '/unknown', '/retosx'])
      expect(safeInternalPath(p)).toBeNull()
  })
  it('a handoff url can never be the next of a handoff', () => {
    expect(safeInternalPath('/retos?next=/auth/native-handoff')).toBeNull()
    expect(safeInternalPath('/auth/native-handoff?token_hash=H&next=%2F')).toBeNull()
  })
  it('accepts the page prefixes of the app', () => {
    for (const p of ['/amigos', '/deudas', '/grupos', '/habitos/1', '/libros', '/listo', '/metas', '/notificaciones', '/perfil/ajustes', '/registros/1/time', '/resumen', '/retos', '/series']) expect(safeInternalPath(p)).toBe(p)
  })
  it('rejects non-strings', () => {
    for (const p of [null, undefined, 42, {}, ['/x']]) expect(safeInternalPath(p)).toBeNull()
  })
})
