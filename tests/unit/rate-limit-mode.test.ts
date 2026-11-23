import { describe, expect, it } from 'vitest'
import { skipRateLimit } from '@/lib/rate-limit-mode'

const LOCAL = 'http://127.0.0.1:54321'
const env = (o: Record<string, string | undefined>) => o as unknown as NodeJS.ProcessEnv
const dev = (o: Record<string, string | undefined> = {}) =>
  env({ NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: LOCAL, ...o })

describe('skipRateLimit (allowlist: local development only)', () => {
  it('bypasses only in development, local Supabase, loopback IP', () => {
    expect(skipRateLimit('::1', dev())).toBe(true)
    expect(skipRateLimit('127.0.0.1', dev())).toBe(true)
    expect(skipRateLimit('::1', dev({ NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' }))).toBe(true)
  })
  it('enforces for any NODE_ENV other than development', () => {
    for (const NODE_ENV of ['test', 'production', 'staging', undefined]) {
      expect(skipRateLimit('::1', env({ NODE_ENV, NEXT_PUBLIC_SUPABASE_URL: LOCAL })), String(NODE_ENV)).toBe(false)
    }
  })
  it('enforces on Vercel, with RATE_LIMIT_ENFORCE=1, or against a remote or missing Supabase', () => {
    expect(skipRateLimit('::1', dev({ VERCEL: '1' }))).toBe(false)
    expect(skipRateLimit('::1', dev({ RATE_LIMIT_ENFORCE: '1' }))).toBe(false)
    expect(skipRateLimit('::1', dev({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' }))).toBe(false)
    expect(skipRateLimit('::1', dev({ NEXT_PUBLIC_SUPABASE_URL: undefined }))).toBe(false)
    expect(skipRateLimit('::1', dev({ NEXT_PUBLIC_SUPABASE_URL: 'not a url' }))).toBe(false)
  })
  it('enforces for other or unknown IPs even in local development', () => {
    expect(skipRateLimit('203.0.113.9', dev())).toBe(false)
    expect(skipRateLimit('192.168.1.10', dev())).toBe(false)
    expect(skipRateLimit(null, dev())).toBe(false)
  })
})
