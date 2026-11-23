import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/theme-actions', () => ({ setColor: async () => ({ ok: true }) }))

import { ColorRow, commitColor } from '@/components/ColorRow'
import { COLORS, COLOR_COLUMNS, nextColor, type Color } from '@/lib/theme'

const html = (initial: Color) => renderToStaticMarkup(createElement(ColorRow, { initial }))
const radios = (h: string) => [...h.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map((m) => m[0])
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1]

describe('ColorRow markup', () => {
  it('is a radiogroup named Color with seventeen radios in grid order and their accessible names', () => {
    const h = html('indigo')
    expect(h).toContain('role="radiogroup"')
    expect(h).toContain('aria-label="Color"')
    expect(radios(h).map((r) => attr(r, 'aria-label'))).toEqual([
      'Índigo',
      'Sakura, rosa',
      'Matcha, verde',
      'Yuzu, ámbar',
      'Umi, turquesa',
      'Ume, ciruela',
      'Sumi, grafito',
      'Sora, azul',
      'Kon, azul marino',
      'Fuji, lavanda',
      'Budō, uva',
      'Mori, bosque',
      'Wakaba, lima',
      'Kin, oliva dorado',
      'Cha, café',
      'Nezu, pizarra',
      'Suna, arena',
    ])
  })

  it.each(COLORS)('with %s selected exactly that radio is checked and is the tab stop', (c) => {
    const rs = radios(html(c))
    const checked = rs.filter((r) => attr(r, 'aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(attr(checked[0], 'data-color-option')).toBe(c)
    expect(rs.filter((r) => attr(r, 'tabindex') === '0')).toEqual(checked)
    expect(rs.filter((r) => attr(r, 'tabindex') === '-1')).toHaveLength(16)
  })

  it('lays the swatches out as a six-column grid and keys use the same column count', () => {
    const h = html('indigo')
    expect(COLOR_COLUMNS).toBe(6)
    expect(h).toMatch(/role="radiogroup"[^>]*class="[^"]*\bgrid-cols-6\b/)
    expect(radios(h)).toHaveLength(17)
  })

  it('keyboard: Up/Down move a row, Home/End jump, Left/Right walk the order (what the row calls)', () => {
    expect(nextColor('indigo', 'ArrowDown')).toBe('sumi')
    expect(nextColor('sumi', 'ArrowUp')).toBe('indigo')
    expect(nextColor('kon', 'ArrowDown')).toBe('cha')
    expect(nextColor('kon', 'Home')).toBe('indigo')
    expect(nextColor('kon', 'End')).toBe('suna')
    expect(nextColor('ume', 'ArrowRight')).toBe('sumi')
    expect(nextColor('sumi', 'ArrowLeft')).toBe('ume')
  })

  it('shows the name of the selected color as text', () => {
    expect(html('budo')).toContain('>Budō<')
    expect(html('matcha')).toContain('>Matcha<')
    expect(html('indigo')).toContain('>Índigo<')
  })

  it('every radio is a 44 px target; swatches scope the accent with data-color and carry no hex', () => {
    const h = html('umi')
    for (const r of radios(h)) expect(r).toMatch(/\bsize-11\b/)
    for (const c of COLORS) expect(h).toContain(`data-color="${c}"`)
    expect(h).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|style=/)
  })

  it('the selected state does not rely on colour alone: a check mark and a ring', () => {
    const h = html('sakura')
    expect((h.match(/data-selected-mark/g) ?? []).length).toBe(1)
    const selected = radios(h).find((r) => attr(r, 'aria-checked') === 'true')!
    expect(selected).toContain('border-ink')
  })
})

describe('commitColor', () => {
  it('applies at once, saves, and keeps the choice on success', async () => {
    const apply = vi.fn()
    const save = vi.fn(async () => ({ ok: true as const }))
    await expect(commitColor('sakura', 'indigo', { apply, save })).resolves.toEqual({ ok: true })
    expect(apply.mock.calls).toEqual([['sakura']])
    expect(save).toHaveBeenCalledWith('sakura')
  })

  it('reverts to the previous color and returns the server error when the action refuses', async () => {
    const apply = vi.fn()
    const save = vi.fn(async () => ({ ok: false as const, error: 'Ese color no está disponible.' }))
    await expect(commitColor('sakura', 'umi', { apply, save })).resolves.toEqual({
      ok: false,
      error: 'Ese color no está disponible.',
    })
    expect(apply.mock.calls).toEqual([['sakura'], ['umi']])
  })

  it('reverts with the generic retry copy when the action throws', async () => {
    const apply = vi.fn()
    const save = vi.fn(async () => {
      throw new Error('network')
    })
    await expect(commitColor('yuzu', 'indigo', { apply, save })).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar el color. Inténtalo de nuevo.',
    })
    expect(apply.mock.calls).toEqual([['yuzu'], ['indigo']])
  })
})

describe('commitColor with a later choice', () => {
  it('B fails after C succeeded: C stays shown, nothing is reverted', async () => {
    const apply = vi.fn()
    const save = vi.fn(async () => ({ ok: false as const, error: 'No pudimos guardar el color. Inténtalo de nuevo.' }))
    // the colour shown now is C (matcha), not the failed B (sakura)
    const r = await commitColor('sakura', 'indigo', { apply, save, current: () => 'matcha' })
    expect(r.ok).toBe(false)
    expect(apply.mock.calls).toEqual([['sakura']])
  })

  it('B fails with nothing after it: reverts to the previous colour and returns the error copy', async () => {
    const apply = vi.fn()
    const save = vi.fn(async () => ({ ok: false as const, error: 'No pudimos guardar el color. Inténtalo de nuevo.' }))
    const r = await commitColor('sakura', 'indigo', { apply, save, current: () => 'sakura' })
    expect(r).toEqual({ ok: false, error: 'No pudimos guardar el color. Inténtalo de nuevo.' })
    expect(apply.mock.calls).toEqual([['sakura'], ['indigo']])
  })

  it('the same holds when the save throws', async () => {
    const apply = vi.fn()
    const save = vi.fn(async () => { throw new Error('x') })
    await commitColor('sakura', 'indigo', { apply, save, current: () => 'umi' })
    expect(apply.mock.calls).toEqual([['sakura']])
  })
})
