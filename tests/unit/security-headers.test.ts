import { describe, expect, it } from 'vitest'
import { SECURITY_HEADERS } from '@/lib/security-headers'
import nextConfig from '../../next.config'

describe('SECURITY_HEADERS', () => {
  it('is exactly the five agreed headers', () => {
    expect(SECURITY_HEADERS).toEqual([
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
    ])
  })
})

describe('next.config headers()', () => {
  it('applies the list to /:path* and keeps the two art cache entries', async () => {
    const rules = await (
      nextConfig as unknown as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }
    ).headers()
    const all = rules.find((r) => r.source === '/:path*')
    expect(all?.headers).toEqual(SECURITY_HEADERS)
    const cache = rules.filter((r) => r.headers.some((h) => h.key === 'Cache-Control'))
    expect(cache.map((r) => r.source)).toEqual([
      '/brand/:file([^/]+\\.(?:gif|png|webp))',
      '/avatars/:file([^/]+\\.(?:gif|png|webp))',
    ])
    expect(cache.every((r) => r.headers[0].value === 'public, max-age=604800, stale-while-revalidate=2592000')).toBe(true)
  })
})
