import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/middleware', () => ({ updateSession: vi.fn() }))

import { config } from '@/middleware'

const matches = (path: string) =>
  config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path))

describe('middleware matcher', () => {
  it('skips Digital Asset Links so Android can verify the TWA without a session', () => {
    expect(matches('/.well-known/assetlinks.json')).toBe(false)
  })

  it('still runs on app pages', () => {
    expect(matches('/dashboard')).toBe(true)
    expect(matches('/login')).toBe(true)
  })
})
