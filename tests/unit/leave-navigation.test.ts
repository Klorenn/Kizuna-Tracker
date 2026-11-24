import { describe, expect, it, vi } from 'vitest'
import { leaveAfterWrite } from '@/lib/leave-navigation'

describe('leaveAfterWrite', () => {
  it('replaces AND refreshes: a route-handler write does not invalidate the client router cache by itself', () => {
    const router = { replace: vi.fn(), refresh: vi.fn() }
    leaveAfterWrite(router, '/')
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })
})
