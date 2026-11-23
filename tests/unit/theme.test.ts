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
  it('offers the seven colors, Índigo first, stored in the "color" cookie', () => {
    expect(COLORS).toEqual(['indigo', 'sakura', 'matcha', 'yuzu', 'umi', 'ume', 'sumi'])
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
    })
    expect(COLOR_NAME).toEqual({
      indigo: 'Índigo',
      sakura: 'Sakura, rosa',
      matcha: 'Matcha, verde',
      yuzu: 'Yuzu, ámbar',
      umi: 'Umi, turquesa',
      ume: 'Ume, ciruela',
      sumi: 'Sumi, grafito',
    })
  })

  it('parses the cookie strictly and defaults to indigo', () => {
    for (const c of COLORS) expect(parseColor(c)).toBe(c)
    for (const bad of ['SAKURA', 'Sakura', 'rojo', '', ' sakura', 'sakura; path=/', undefined, null]) {
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

  it('arrow keys move the selection and wrap around; other keys do nothing', () => {
    expect(nextColor('indigo', 'ArrowRight')).toBe('sakura')
    expect(nextColor('indigo', 'ArrowDown')).toBe('sakura')
    expect(nextColor('sumi', 'ArrowRight')).toBe('indigo')
    expect(nextColor('indigo', 'ArrowLeft')).toBe('sumi')
    expect(nextColor('yuzu', 'ArrowUp')).toBe('matcha')
    expect(nextColor('yuzu', 'Home')).toBe('indigo')
    expect(nextColor('yuzu', 'End')).toBe('sumi')
    expect(nextColor('yuzu', 'a')).toBeNull()
  })
})
