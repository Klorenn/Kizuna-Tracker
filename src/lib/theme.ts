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
