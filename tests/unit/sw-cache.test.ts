import { describe, expect, it } from 'vitest'
import { isStaticAsset, PRECACHE_GLOBS } from '@/lib/sw-cache'

const req = (url: string, sameOrigin = true, destination = '') => ({
  url: new URL(url),
  sameOrigin,
  request: { destination, mode: 'cors' } as unknown as Request,
})

describe('isStaticAsset (the only thing the service worker caches at runtime)', () => {
  it.each(['/_next/static/chunks/a.js', '/icons/icon-192.png', '/brand/cat-lift.gif', '/avatars/preset-1.webp'])('caches %s', (p) => {
    expect(isStaticAsset(req(`https://kizuna.app${p}`))).toBe(true)
  })
  it('caches same-origin fonts', () => {
    expect(isStaticAsset(req('https://kizuna.app/x.woff2', true, 'font'))).toBe(true)
  })
  it.each(['/', '/amigos', '/api/checkins/photo', '/_next/image?url=x', '/perfil?_rsc=1'])('never caches %s', (p) => {
    expect(isStaticAsset(req(`https://kizuna.app${p}`))).toBe(false)
  })
  it('never caches cross-origin (signed photo URLs, supabase)', () => {
    expect(isStaticAsset(req('https://abc.supabase.co/storage/v1/object/sign/proofs/x.jpg?token=1', false))).toBe(false)
    expect(isStaticAsset(req('https://abc.supabase.co/_next/static/x.js', false))).toBe(false)
  })
})

describe('PRECACHE_GLOBS (what the service worker downloads on install)', () => {
  it('never precaches the cat GIFs or the rest of public/brand (they cache on first use)', () => {
    expect(PRECACHE_GLOBS.some((g) => g.includes('brand'))).toBe(false)
    expect(PRECACHE_GLOBS).not.toContain('public/**/*')
  })
  it('precaches the build output, the app icons and the avatar presets', () => {
    expect(PRECACHE_GLOBS).toContain('public/icons/**/*')
    expect(PRECACHE_GLOBS).toContain('public/avatars/**/*')
    expect(PRECACHE_GLOBS.some((g) => g.startsWith('.next/static/'))).toBe(true)
  })
})
