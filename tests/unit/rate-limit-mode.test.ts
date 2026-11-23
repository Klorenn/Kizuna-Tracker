import { describe, expect, it } from 'vitest'
import { skipRateLimit } from '@/lib/rate-limit-mode'

const dev = { NODE_ENV: 'development' } as NodeJS.ProcessEnv
const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv

describe('skipRateLimit', () => {
  it('skips the limiter for loopback addresses in development', () => {
    for (const ip of ['::1', '127.0.0.1', '::ffff:127.0.0.1']) expect(skipRateLimit(ip, dev)).toBe(true)
  })
  it('never skips in production, loopback or not', () => {
    expect(skipRateLimit('::1', prod)).toBe(false)
    expect(skipRateLimit('127.0.0.1', prod)).toBe(false)
    expect(skipRateLimit('203.0.113.9', prod)).toBe(false)
  })
  it('keeps the limiter for non-loopback or unknown addresses in development', () => {
    expect(skipRateLimit('203.0.113.9', dev)).toBe(false)
    expect(skipRateLimit('192.168.1.10', dev)).toBe(false)
    expect(skipRateLimit(null, dev)).toBe(false)
  })
  it('RATE_LIMIT_ENFORCE=1 forces the production limiter in development', () => {
    expect(skipRateLimit('::1', { ...dev, RATE_LIMIT_ENFORCE: '1' } as NodeJS.ProcessEnv)).toBe(false)
  })
  it('also applies to the test environment', () => {
    expect(skipRateLimit('::1', { NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true)
  })
})
