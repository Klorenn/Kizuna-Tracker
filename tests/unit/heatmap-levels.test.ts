import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const heatmap = readFileSync(join(process.cwd(), 'src/components/profile/ActivityHeatmap.tsx'), 'utf8')

function block(selector: string, from = 0): string {
  const at = tokens.indexOf(`${selector} {`, from)
  if (at < 0) throw new Error(`missing ${selector}`)
  let depth = 0
  const start = tokens.indexOf('{', at)
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i] === '{') depth++
    if (tokens[i] === '}' && --depth === 0) return tokens.slice(start + 1, i)
  }
  throw new Error('unbalanced')
}
const decls = (b: string) => Object.fromEntries([...b.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]))
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex: string) => {
  if (!/^#[0-9a-f]{6}$/.test(hex)) throw new Error(`not #rrggbb: ${hex}`)
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const light = decls(block('@theme'))
const dark = { ...light, ...decls(block(':root[data-theme="dark"]')) }
const system = decls(block(':root[data-theme="system"]', tokens.indexOf('@media (prefers-color-scheme: dark)')))

describe('activity heatmap steps', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ])('%s: every filled step is >= 3:1 against the empty cell and steps are apart', (_n, t) => {
    const empty = t['--color-heat-0']
    const steps = [1, 2, 3, 4].map((i) => t[`--color-heat-${i}`])
    for (const s of steps) expect(contrast(s, empty)).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < steps.length; i++) expect(contrast(steps[i], steps[i - 1])).toBeGreaterThanOrEqual(1.3)
  })
  it('the system-dark block mirrors the dark heat steps', () => {
    for (const i of [0, 1, 2, 3, 4]) expect(system[`--color-heat-${i}`]).toBe(dark[`--color-heat-${i}`])
  })
  it('uses the heat tokens and labels of at least 12 px', () => {
    expect(heatmap).toContain('bg-heat-4')
    expect(heatmap).not.toMatch(/text-\[(\d|10|11)px\]/)
  })
})
