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
