import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HABIT_COLORS } from '@/domain/habit-colors'

const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

/** Body of the first rule whose prelude is exactly `selector` (brace-matched, comments stripped). */
function body(css: string, selector: string, from = 0): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const at = clean.indexOf(`${selector} {`, from)
  if (at < 0) throw new Error(`missing rule ${selector}`)
  let depth = 0
  const start = clean.indexOf('{', at)
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === '{') depth++
    if (clean[i] === '}' && --depth === 0) return clean.slice(start + 1, i)
  }
  throw new Error(`unbalanced ${selector}`)
}

/** Bodies of every top-level rule with that exact prelude, joined. */
function bodies(css: string, selector: string): string {
  const out: string[] = []
  let from = 0
  for (;;) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const at = clean.indexOf(`${selector} {`, from)
    if (at < 0) return out.join('\n')
    out.push(body(css, selector, at))
    from = at + selector.length
  }
}

function decls(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim().toLowerCase()
  return out
}

const light = { ...decls(body(tokens, '@theme')), ...decls(bodies(tokens, ':root')) }
const darkExplicit = decls(body(tokens, ':root[data-theme="dark"]'))
const media = body(tokens, '@media (prefers-color-scheme: dark)')
const darkSystem = decls(body(media, ':root[data-theme="system"]'))
const dark = { ...light, ...darkExplicit }

// WCAG 2.x contrast for #rrggbb values
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/.test(hex)) throw new Error(`not a #rrggbb color: ${hex}`)
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
// OKLab distance (x100) to keep habit colors apart from each other and from the alert red
function oklab(hex: string): number[] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const distance = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100
}

describe('dark theme tokens', () => {
  it('the explicit and the system dark blocks are identical', () => {
    expect(darkSystem).toEqual(darkExplicit)
  })

  it('declares a color-scheme for each preference', () => {
    expect(light['color-scheme']).toBe('light')
    expect(darkExplicit['color-scheme']).toBe('dark')
    expect(decls(body(tokens, ':root[data-theme="system"]'))['color-scheme']).toBe('light dark')
  })

  it('overrides every themeable color (only the media chrome, cream and shu stay fixed)', () => {
    const fixed = ['--color-cream', '--color-media', '--color-on-media']
    const themeable = Object.keys(light).filter((k) => k.startsWith('--color-') && !fixed.includes(k))
    expect(themeable.filter((k) => !(k in darkExplicit))).toEqual([])
    expect(darkExplicit['--shadow-card']).toBe('none')
  })

  it('uses the ink, stepped surfaces and hairlines of the spec', () => {
    expect(dark['--color-paper']).toBe('#0f0f10')
    expect(dark['--color-surface']).toBe('#161618')
    expect(dark['--color-field']).toBe('#1c1c1f')
    expect(dark['--color-line']).toBe('#2a2a2e')
    expect(dark['--color-ink']).toBe('#ededed')
    expect(dark['--color-muted']).toBe('#9a9aa0')
  })

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s theme meets AA', (_, t) => {
    const c = (a: string, b: string) => contrast(t[a], t[b])
    for (const bg of ['--color-paper', '--color-surface', '--color-field']) {
      expect(c('--color-ink', bg)).toBeGreaterThanOrEqual(7)
      expect(c('--color-accent', bg)).toBeGreaterThanOrEqual(3) // focus ring and selection outline
    }
    expect(c('--color-muted', '--color-paper')).toBeGreaterThanOrEqual(4.5)
    expect(c('--color-muted', '--color-surface')).toBeGreaterThanOrEqual(4.5)
    expect(c('--color-accent', '--color-surface')).toBeGreaterThanOrEqual(4.5) // accent links
    expect(c('--color-accent', '--color-paper')).toBeGreaterThanOrEqual(4.5)
    expect(c('--color-accent', '--color-accent-soft')).toBeGreaterThanOrEqual(4.5) // selected chips
    expect(c('--color-on-accent', '--color-accent')).toBeGreaterThanOrEqual(4.5) // primary button
    expect(c('--color-on-accent', '--color-accent-hover')).toBeGreaterThanOrEqual(4.5)
    expect(c('--color-outline-strong', '--color-surface')).toBeGreaterThanOrEqual(3) // input borders
    expect(c('--color-alert', '--color-surface')).toBeGreaterThanOrEqual(3) // alert icons
    expect(c('--color-alert-text', '--color-surface')).toBeGreaterThanOrEqual(4.5) // "Borrar cuenta"
    expect(c('--color-alert-text', '--color-paper')).toBeGreaterThanOrEqual(4.5)
    expect(c('--color-accent2', '--color-paper')).toBeGreaterThanOrEqual(3) // cat details
    expect(c('--color-on-media', '--color-media')).toBeGreaterThanOrEqual(7)
  })

  it('dark muted text stays AA on fields too', () => {
    expect(contrast(dark['--color-muted'], dark['--color-field'])).toBeGreaterThanOrEqual(4.5)
  })

  it('switch knob reads against both tracks', () => {
    for (const t of [light, dark]) {
      expect(contrast(t['--color-on-accent'], t['--color-accent'])).toBeGreaterThanOrEqual(3)
      expect(contrast(t['--color-knob'], t['--color-outline-strong'])).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('habit palette tokens', () => {
  it.each(HABIT_COLORS)('%s has a solid and a soft token, and a dark variant', (key) => {
    expect(light[`--habit-${key}`]).toMatch(/^#[0-9a-f]{6}$/)
    expect(dark[`--habit-${key}`]).toMatch(/^#[0-9a-f]{6}$/)
    expect(darkExplicit[`--habit-${key}`]).not.toBe(light[`--habit-${key}`])
    expect(light[`--habit-${key}-soft`]).toBe(
      `color-mix(in oklab, var(--habit-${key}) var(--habit-soft-mix), transparent)`,
    )
  })

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: text on every habit color is AA and every color reads on cards', (_, t) => {
    for (const key of HABIT_COLORS) {
      const hex = t[`--habit-${key}`]
      expect(contrast(t['--habit-on'], hex), key).toBeGreaterThanOrEqual(4.5)
      expect(contrast(hex, t['--color-surface']), key).toBeGreaterThanOrEqual(3)
    }
  })

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: habit colors are distinguishable from each other and from the alert red', (_, t) => {
    for (const a of HABIT_COLORS) {
      expect(distance(t[`--habit-${a}`], t['--color-alert']), a).toBeGreaterThanOrEqual(10)
      for (const b of HABIT_COLORS) {
        if (a < b) expect(distance(t[`--habit-${a}`], t[`--habit-${b}`]), `${a}/${b}`).toBeGreaterThanOrEqual(6)
      }
    }
  })

  it('soft fills get a stronger mix on dark', () => {
    expect(light['--habit-soft-mix']).toBe('16%')
    expect(darkExplicit['--habit-soft-mix']).toBe('24%')
  })

  it.each(HABIT_COLORS)('globals.css scopes data-habit-color="%s" to --habit / --habit-soft', (key) => {
    const rule = decls(body(globals, `[data-habit-color="${key}"]`))
    expect(rule).toEqual({ '--habit': `var(--habit-${key})`, '--habit-soft': `var(--habit-${key}-soft)` })
  })

  it('globals.css defines the dark variant for the cookie and for the system preference', () => {
    const variant = body(globals, '@custom-variant dark')
    expect(variant).toContain('[data-theme="dark"]')
    expect(variant).toContain('@media (prefers-color-scheme: dark)')
    expect(variant).toContain('[data-theme="system"]')
  })
})
