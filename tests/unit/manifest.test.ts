import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'
import { pngSize } from '@/lib/png'

describe('manifest', () => {
  const m = manifest()
  it('names the app and is installable', () => {
    expect(m.name).toBe('Kizuna Tracker')
    expect(m.short_name).toBe('Kizuna')
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.lang).toBe('es')
    expect(m.theme_color).toBe('#FAFAFA')
    expect(m.background_color).toBe('#FAFAFA')
  })
  it('declares 192, 512 and a maskable 512 icon', () => {
    const icons = m.icons ?? []
    expect(icons.find((i) => i.sizes === '192x192' && i.purpose !== 'maskable')).toBeTruthy()
    expect(icons.find((i) => i.sizes === '512x512' && i.purpose !== 'maskable')).toBeTruthy()
    expect(icons.find((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBeTruthy()
  })
})

describe('icon files', () => {
  const dir = join(process.cwd(), 'public/icons')
  const expected: Record<string, number> = {
    'favicon-16.png': 16,
    'favicon-32.png': 32,
    'apple-touch-icon-180.png': 180,
    'icon-192.png': 192,
    'icon-512.png': 512,
    'icon-maskable-512.png': 512,
  }
  it('has all six PNGs at their named size', () => {
    expect(readdirSync(dir).filter((f) => f.endsWith('.png')).sort()).toEqual(Object.keys(expected).sort())
    for (const [file, size] of Object.entries(expected)) {
      expect(pngSize(readFileSync(join(dir, file)))).toEqual({ width: size, height: size })
    }
  })
  it('pngSize rejects non-PNG data', () => {
    expect(() => pngSize(new Uint8Array([1, 2, 3]))).toThrow()
  })
})
