import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  THEMES,
  THEME_COLOR,
  THEME_COOKIE,
  appleStatusBarStyle,
  parseTheme,
  themeColorFor,
  themeCookieOptions,
  COLORS,
  COLOR_COLUMNS,
  COLOR_COOKIE,
  COLOR_LABEL,
  COLOR_NAME,
  colorCookieOptions,
  nextColor,
  parseColor,
} from '@/lib/theme'

describe('theme preference', () => {
  it('offers Sistema / Claro / Oscuro, stored in the "theme" cookie', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark'])
    expect(THEME_COOKIE).toBe('theme')
  })

  it('parses the cookie strictly and defaults to system', () => {
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('system')).toBe('system')
    expect(parseTheme(undefined)).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme('DARK')).toBe('system')
    expect(parseTheme('dark; path=/')).toBe('system')
  })

  it('theme-color follows the choice; system answers per color scheme', () => {
    expect(themeColorFor('light')).toBe(THEME_COLOR.light)
    expect(themeColorFor('dark')).toBe(THEME_COLOR.dark)
    expect(themeColorFor('system')).toEqual([
      { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
      { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
    ])
  })

  it('theme colors mirror --color-paper in both themes of tokens.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8').toLowerCase()
    expect(THEME_COLOR.light.toLowerCase()).toBe('#fafafa')
    expect(css).toContain(`--color-paper: ${THEME_COLOR.light.toLowerCase()}`)
    expect(css).toContain(`--color-paper: ${THEME_COLOR.dark.toLowerCase()}`)
  })

  it('the iOS status bar goes dark only for an explicit dark theme', () => {
    expect(appleStatusBarStyle('dark')).toBe('black')
    expect(appleStatusBarStyle('light')).toBe('default')
    expect(appleStatusBarStyle('system')).toBe('default')
  })

  it('cookie lasts a year, site-wide, lax, secure only in production', () => {
    expect(themeCookieOptions(false)).toEqual({
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: true,
      secure: false,
    })
    expect(themeCookieOptions(true).secure).toBe(true)
  })
})

describe('color preference', () => {
  it('offers the seventeen colors in grid order, Índigo first, stored in the "color" cookie', () => {
    expect(COLORS).toEqual([
      'indigo', 'sakura', 'matcha', 'yuzu', 'umi', 'ume', 'sumi',
      'sora', 'kon', 'fuji', 'budo', 'mori', 'wakaba', 'kin', 'cha', 'nezu', 'suna',
    ])
    expect(COLOR_COLUMNS).toBe(6)
    expect(COLOR_COOKIE).toBe('color')
  })

  it('has a short label and an accessible name per color', () => {
    expect(COLOR_LABEL).toEqual({
      indigo: 'Índigo',
      sakura: 'Sakura',
      matcha: 'Matcha',
      yuzu: 'Yuzu',
      umi: 'Umi',
      ume: 'Ume',
      sumi: 'Sumi',
      sora: 'Sora',
      kon: 'Kon',
      fuji: 'Fuji',
      budo: 'Budō',
      mori: 'Mori',
      wakaba: 'Wakaba',
      kin: 'Kin',
      cha: 'Cha',
      nezu: 'Nezu',
      suna: 'Suna',
    })
    expect(COLOR_NAME).toEqual({
      indigo: 'Índigo',
      sakura: 'Sakura, rosa',
      matcha: 'Matcha, verde',
      yuzu: 'Yuzu, ámbar',
      umi: 'Umi, turquesa',
      ume: 'Ume, ciruela',
      sumi: 'Sumi, grafito',
      sora: 'Sora, azul',
      kon: 'Kon, azul marino',
      fuji: 'Fuji, lavanda',
      budo: 'Budō, uva',
      mori: 'Mori, bosque',
      wakaba: 'Wakaba, lima',
      kin: 'Kin, oliva dorado',
      cha: 'Cha, café',
      nezu: 'Nezu, pizarra',
      suna: 'Suna, arena',
    })
  })

  it('parses the cookie strictly and defaults to indigo', () => {
    for (const c of COLORS) expect(parseColor(c)).toBe(c)
    expect(parseColor('budo')).toBe('budo')
    for (const bad of ['budō', 'BUDO', 'Budo', 'SAKURA', 'Sakura', 'rojo', '', ' sakura', 'sakura; path=/', undefined, null]) {
      expect(parseColor(bad)).toBe('indigo')
    }
  })

  it('uses the same cookie options as the theme cookie', () => {
    expect(colorCookieOptions(false)).toEqual(themeCookieOptions(false))
    expect(colorCookieOptions(true)).toEqual({
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: true,
      secure: true,
    })
  })

  it('Left/Right walk all seventeen in order and wrap; Home/End jump; other keys do nothing', () => {
    let c = 'indigo' as (typeof COLORS)[number]
    const seen = [c]
    for (let i = 0; i < COLORS.length - 1; i++) {
      c = nextColor(c, 'ArrowRight')!
      seen.push(c)
    }
    expect(seen).toEqual([...COLORS])
    expect(nextColor('suna', 'ArrowRight')).toBe('indigo')
    expect(nextColor('indigo', 'ArrowLeft')).toBe('suna')
    expect(nextColor('sumi', 'ArrowRight')).toBe('sora')
    expect(nextColor('yuzu', 'Home')).toBe('indigo')
    expect(nextColor('yuzu', 'End')).toBe('suna')
    expect(nextColor('yuzu', 'a')).toBeNull()
  })

  it('Up/Down move by a row of six and stop at the first and last row', () => {
    expect(nextColor('indigo', 'ArrowDown')).toBe('sumi')
    expect(nextColor('sakura', 'ArrowDown')).toBe('sora')
    expect(nextColor('sumi', 'ArrowDown')).toBe('wakaba') // second row to third
    expect(nextColor('mori', 'ArrowDown')).toBe('suna') // no cell below the sixth column: the last one
    expect(nextColor('wakaba', 'ArrowUp')).toBe('sumi')
    expect(nextColor('sora', 'ArrowUp')).toBe('sakura')
    expect(nextColor('indigo', 'ArrowUp')).toBe('indigo') // first row: stays
    expect(nextColor('suna', 'ArrowDown')).toBe('suna') // last row: stays
    expect(nextColor('nezu', 'ArrowDown')).toBe('nezu')
    expect(nextColor('kon', 'ArrowDown')).toBe('cha')
  })
})
