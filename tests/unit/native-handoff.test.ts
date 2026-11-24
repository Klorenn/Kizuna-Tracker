import { describe, expect, it, vi } from 'vitest'
import { nativeHandoff } from '@/lib/native-handoff'

const GOOD = 'hash_abc-123_DEF456'

describe('nativeHandoff', () => {
  it('verifies the token and redirects to the safe next path', async () => {
    const verify = vi.fn(async () => true)
    expect(await nativeHandoff({ tokenHash: GOOD, next: '/retos/123' }, { verify })).toBe('/retos/123')
    expect(verify).toHaveBeenCalledWith(GOOD)
  })
  it('an expired or used link goes to /login', async () => {
    expect(await nativeHandoff({ tokenHash: GOOD, next: '/retos' }, { verify: async () => false })).toBe('/login')
  })
  it('a verifier that throws goes to /login too', async () => {
    expect(await nativeHandoff({ tokenHash: GOOD, next: '/retos' }, { verify: async () => { throw new Error('x') } })).toBe('/login')
  })
  it('an unsafe next falls back to / (never an open redirect)', async () => {
    for (const next of ['//evil.com', 'https://evil.com', '/a/../b', null, '']) {
      expect(await nativeHandoff({ tokenHash: GOOD, next }, { verify: async () => true })).toBe('/')
    }
  })
  it('a malformed token never reaches the verifier', async () => {
    const verify = vi.fn(async () => true)
    for (const tokenHash of [null, '', 'short', 'x'.repeat(300), 'has space and !! chars']) {
      expect(await nativeHandoff({ tokenHash, next: '/' }, { verify })).toBe('/login')
    }
    expect(verify).not.toHaveBeenCalled()
  })
})
