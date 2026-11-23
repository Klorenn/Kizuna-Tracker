import { describe, expect, it } from 'vitest'
import { isTabActive } from '@/components/bottom-nav-active'

describe('isTabActive', () => {
  it('Hoy: the root and habit screens', () => {
    expect(isTabActive('/', '/')).toBe(true)
    expect(isTabActive('/', '/habitos/abc')).toBe(true)
    expect(isTabActive('/', '/retos')).toBe(false)
  })
  it('Amigos: its pages, profiles and /@handle', () => {
    expect(isTabActive('/amigos', '/amigos/explorar')).toBe(true)
    expect(isTabActive('/amigos', '/@pau_k')).toBe(true)
    expect(isTabActive('/amigos', '/u/pau_k')).toBe(true)
  })
  it('Retos: its pages and everything under /grupos', () => {
    expect(isTabActive('/retos', '/retos')).toBe(true)
    expect(isTabActive('/retos', '/retos/nuevo')).toBe(true)
    expect(isTabActive('/retos', '/grupos')).toBe(true)
    expect(isTabActive('/retos', '/grupos/nuevo')).toBe(true)
    expect(isTabActive('/retos', '/grupos/01234567-89ab-cdef-0123-456789abcdef')).toBe(true)
  })
  it('no other tab lights up under /grupos', () => {
    for (const tab of ['/', '/amigos', '/resumen', '/perfil']) expect(isTabActive(tab, '/grupos/nuevo')).toBe(false)
  })
  it('does not match a look-alike prefix', () => {
    expect(isTabActive('/retos', '/gruposx')).toBe(false)
  })
  it('the other tabs keep matching by prefix', () => {
    expect(isTabActive('/resumen', '/resumen')).toBe(true)
    expect(isTabActive('/perfil', '/perfil/editar')).toBe(true)
  })
})
