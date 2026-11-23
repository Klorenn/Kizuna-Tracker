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
  it('is exactly the build output, the app icons and the avatar presets: no brand art, no public/**', () => {
    expect(PRECACHE_GLOBS).toEqual([
      '.next/static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}',
      'public/icons/**/*',
      'public/avatars/**/*',
    ])
  })
})

describe('versioned brand urls', () => {
  it('still match the runtime cache when they carry the ?v= query (the query stays in the cache key)', () => {
    expect(isStaticAsset(req('https://kizuna.app/brand/cat-jump.gif?v=2'))).toBe(true)
  })
})
