import { describe, expect, it, vi } from 'vitest'

// withSerwist only wraps the config for the build; the test reads the plain object it receives.
vi.mock('@serwist/turbopack', () => ({ withSerwist: (c: unknown) => c }))

describe('next.config client router cache', () => {
  it('keeps visited tabs reusable: 30 s dynamic, 180 s static', async () => {
    const { default: config } = await import('../../next.config')
    expect(config.experimental?.staleTimes).toEqual({ dynamic: 30, static: 180 })
    expect(config.experimental?.optimizePackageImports).toContain('@phosphor-icons/react')
  })
})
