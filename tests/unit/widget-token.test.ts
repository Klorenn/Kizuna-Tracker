import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { WIDGET_TOKEN_RE, bearerToken, generateWidgetToken, hashWidgetToken } from '@/lib/widget-token'

describe('generateWidgetToken', () => {
  it('es kzw_ + 43 caracteres base64url', () => {
    const t = generateWidgetToken()
    expect(t).toMatch(/^kzw_[A-Za-z0-9_-]{43}$/)
    expect(WIDGET_TOKEN_RE.test(t)).toBe(true)
  })
  it('no repite', () => {
    expect(new Set(Array.from({ length: 50 }, generateWidgetToken)).size).toBe(50)
  })
})

describe('hashWidgetToken', () => {
  it('sha256 hex de 64 caracteres, determinista', () => {
    const t = generateWidgetToken()
    expect(hashWidgetToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashWidgetToken(t)).toBe(hashWidgetToken(t))
    expect(hashWidgetToken(t)).toBe(createHash('sha256').update(t).digest('hex'))
  })
  it('tokens distintos dan hashes distintos', () => {
    expect(hashWidgetToken(generateWidgetToken())).not.toBe(hashWidgetToken(generateWidgetToken()))
  })
})

describe('bearerToken', () => {
  const t = generateWidgetToken()
  it('acepta solo "Bearer kzw_..."', () => {
    expect(bearerToken(`Bearer ${t}`)).toBe(t)
  })
  it.each([
    ['null', null],
    ['vacío', ''],
    ['sin esquema', t],
    ['esquema en minúsculas', `bearer ${t}`],
    ['esquema en mayúsculas', `BEARER ${t}`],
    ['doble espacio', `Bearer  ${t}`],
    ['espacio al final', `Bearer ${t} `],
    ['espacio al inicio', ` Bearer ${t}`],
    ['otro prefijo', `Bearer sb_${t.slice(4)}`],
    ['corto', 'Bearer kzw_abc'],
    ['largo', `Bearer ${t}x`],
    ['caracteres inválidos', `Bearer kzw_${'+'.repeat(43)}`],
    ['dos tokens', `Bearer ${t} ${t}`],
    ['basic', `Basic ${t}`],
  ])('rechaza %s', (_n, h) => {
    expect(bearerToken(h as string | null)).toBeNull()
  })
})
