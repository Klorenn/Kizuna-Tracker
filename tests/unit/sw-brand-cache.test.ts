import { describe, expect, it } from 'vitest'
import { BRAND_CACHE_LIMITS, BRAND_CACHE_NAME, STATIC_CACHE_NAME, isBrandAsset } from '@/lib/sw-cache'

const req = (url: string, sameOrigin = true) => ({
  url: new URL(url),
  sameOrigin,
  request: { destination: '' } as Pick<Request, 'destination'>,
})

describe('brand cache (bounded, separate from the rest of the static cache)', () => {
  it('matches only same-origin /brand/ files, with their version query', () => {
    expect(isBrandAsset(req('https://kizuna.app/brand/cat-jump.gif?v=2'))).toBe(true)
    expect(isBrandAsset(req('https://kizuna.app/brand/cat-jump-still.png?v=2'))).toBe(true)
    expect(isBrandAsset(req('https://kizuna.app/avatars/preset-1.webp'))).toBe(false)
    expect(isBrandAsset(req('https://kizuna.app/_next/static/a.js'))).toBe(false)
    expect(isBrandAsset(req('https://cdn.example/brand/cat-jump.gif', false))).toBe(false)
  })
  it('has its own cache name and a bounded size and age', () => {
    expect(BRAND_CACHE_NAME).not.toBe(STATIC_CACHE_NAME)
    expect(BRAND_CACHE_NAME).not.toContain('precache')
    expect(BRAND_CACHE_LIMITS.maxEntries).toBeGreaterThan(0)
    expect(BRAND_CACHE_LIMITS.maxEntries).toBeLessThanOrEqual(40)
    expect(BRAND_CACHE_LIMITS.maxAgeSeconds).toBeGreaterThan(0)
    expect(BRAND_CACHE_LIMITS.maxAgeSeconds).toBeLessThanOrEqual(60 * 60 * 24 * 30)
  })
})
