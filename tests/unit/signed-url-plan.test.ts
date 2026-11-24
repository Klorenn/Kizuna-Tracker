import { beforeEach, describe, expect, it, vi } from 'vitest'

const sign = vi.fn()
vi.mock('@/lib/supabase/client', () => ({ createBrowserClient: () => ({ storage: { from: () => ({ createSignedUrls: sign }) } }) }))

const { planSigning, seedCache, resignProof, _resetSignedCache } = await import('@/lib/use-signed-urls')

describe('seeded signed URLs honour their age', () => {
  beforeEach(() => { _resetSignedCache(); sign.mockReset() })

  it('fresh seed is used, unseeded is signed, expired seed is re-signed', () => {
    const now = 1_000_000_000
    seedCache({ 'a/fresh.jpg': 'https://s/fresh' }, now - 10_000)
    seedCache({ 'a/old.jpg': 'https://s/old' }, now - 301_000)
    const plan = planSigning(['a/fresh.jpg', 'a/old.jpg', 'a/new.jpg'], now)
    expect(plan.known).toEqual({ 'a/fresh.jpg': 'https://s/fresh' })
    expect(plan.missing.sort()).toEqual(['a/new.jpg', 'a/old.jpg'])
  })

  it('resignProof signs one path in the browser and caches it', async () => {
    sign.mockResolvedValue({ data: [{ path: 'a/x.jpg', signedUrl: 'https://s/x2', error: null }] })
    expect(await resignProof('a/x.jpg')).toBe('https://s/x2')
    expect(planSigning(['a/x.jpg'], Date.now()).known).toEqual({ 'a/x.jpg': 'https://s/x2' })
    sign.mockResolvedValue({ data: [{ path: 'a/y.jpg', signedUrl: '', error: 'nf' }] })
    expect(await resignProof('a/y.jpg')).toBeNull()
  })
})
