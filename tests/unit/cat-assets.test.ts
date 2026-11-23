import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAT_ASSETS, type CatAsset } from '@/lib/motion/cat-animation'

const file = (url: string) => `public${url.split('?')[0]}`
const gifSize = (url: string) => {
  const b = readFileSync(file(url))
  expect(b.subarray(0, 3).toString('latin1')).toBe('GIF')
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
}
const pngSize = (url: string) => {
  const b = readFileSync(file(url))
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG')
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

const assets = Object.entries(CAT_ASSETS) as [CatAsset, (typeof CAT_ASSETS)[CatAsset]][]

describe('cat files match the canvas the mask math assumes', () => {
  it.each(assets)('%s: GIF logical screen is the canvas, the box fits inside it', (_name, a) => {
    expect(gifSize(a.gif)).toEqual({ w: a.canvas, h: a.canvas })
    expect(a.box.x + a.box.w).toBeLessThanOrEqual(a.canvas)
    expect(a.box.y + a.box.h).toBeLessThanOrEqual(a.canvas)
  })

  it.each(assets)('%s: the still PNG has the size of its box on the canvas', (_name, a) => {
    const size = pngSize(a.still)
    // full-frame stills are exported at the canvas size; the lift still is trimmed to its stillBox
    expect(size).toEqual(
      a.stillBox.w === a.canvas ? { w: a.canvas, h: a.canvas } : { w: a.stillBox.w, h: a.stillBox.h },
    )
  })
})

describe('cat weight budget (the GIFs are the heaviest assets in the app)', () => {
  it('keeps the six GIFs under 2.1 MB together and each under 530 kB', () => {
    const sizes = assets.map(([, a]) => statSync(file(a.gif)).size)
    expect(Math.max(...sizes)).toBeLessThan(530 * 1024)
    expect(sizes.reduce((x, y) => x + y, 0)).toBeLessThan(2.1 * 1024 * 1024)
  })
})
