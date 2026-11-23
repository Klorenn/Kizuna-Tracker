/**
 * Theme preference (Perfil > Tema). The choice lives in a cookie so the root layout can render
 * <html data-theme> on the server: no flash, no localStorage. "system" defers to the
 * prefers-color-scheme media query in tokens.css.
 */
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_COOKIE = 'theme'

export const THEME_LABEL: Readonly<Record<Theme, string>> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Oscuro',
}

/** Mirrors --color-paper of each theme in src/styles/tokens.css (meta tags cannot read CSS variables). */
export const THEME_COLOR = { light: '#FAFAFA', dark: '#0F0F10' } as const

export function parseTheme(raw: string | undefined | null): Theme {
  return (THEMES as readonly string[]).includes(raw ?? '') ? (raw as Theme) : 'system'
}

export type ThemeColorDescriptor = string | { media: string; color: string }[]

/** Value for Next's `viewport.themeColor` (the browser and status bar tint). */
export function themeColorFor(theme: Theme): ThemeColorDescriptor {
  if (theme === 'light') return THEME_COLOR.light
  if (theme === 'dark') return THEME_COLOR.dark
  return [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ]
}

/** iOS standalone status bar: only an explicit dark theme can be known on the server. */
export function appleStatusBarStyle(theme: Theme): 'default' | 'black' {
  return theme === 'dark' ? 'black' : 'default'
}

export function themeCookieOptions(production: boolean) {
  return {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: production,
  }
}

/**
 * Color preference (Ajustes > Preferencias > Color): the second setting next to the theme. It only
 * swaps the accent family (see tokens.css) and lives in its own httpOnly cookie, read on the server
 * like the theme, so <html data-color> is right on the first paint. Per device, no account needed.
 */
export const COLORS = ['indigo', 'sakura', 'matcha', 'yuzu', 'umi', 'ume', 'sumi'] as const
export type Color = (typeof COLORS)[number]

export const COLOR_COOKIE = 'color'

/** Short name, shown as text next to the swatches. */
export const COLOR_LABEL: Readonly<Record<Color, string>> = {
  indigo: 'Índigo',
  sakura: 'Sakura',
  matcha: 'Matcha',
  yuzu: 'Yuzu',
  umi: 'Umi',
  ume: 'Ume',
  sumi: 'Sumi',
}

/** Accessible name of each swatch: the name plus what the colour is, for people who cannot see it. */
export const COLOR_NAME: Readonly<Record<Color, string>> = {
  indigo: 'Índigo',
  sakura: 'Sakura, rosa',
  matcha: 'Matcha, verde',
  yuzu: 'Yuzu, ámbar',
  umi: 'Umi, turquesa',
  ume: 'Ume, ciruela',
  sumi: 'Sumi, grafito',
}

export function parseColor(raw: string | undefined | null): Color {
  return (COLORS as readonly string[]).includes(raw ?? '') ? (raw as Color) : 'indigo'
}

/** Same options as the theme cookie: one year, site-wide, lax, httpOnly, secure in production. */
export const colorCookieOptions = themeCookieOptions

/** Radio-group keyboard model: arrows move (and wrap), Home/End jump. Null for any other key. */
export function nextColor(current: Color, key: string): Color | null {
  const i = COLORS.indexOf(current)
  if (key === 'ArrowRight' || key === 'ArrowDown') return COLORS[(i + 1) % COLORS.length]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return COLORS[(i - 1 + COLORS.length) % COLORS.length]
  if (key === 'Home') return COLORS[0]
  if (key === 'End') return COLORS[COLORS.length - 1]
  return null
}
