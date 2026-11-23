import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The close-periods cron closes challenge periods and, after them, due group weeks. Each half runs whether or
// not the other fails; authentication is the same authorizeCronRequest as before (see cron-routes.test.ts).
const rpc = vi.fn()
const activeChallenges = vi.fn()
const createAdminClient = vi.fn()

async function post() {
  const { POST } = await import('@/app/api/cron/close-periods/route')
  return POST(new Request('http://x/api/cron/close-periods', { method: 'POST', headers: { authorization: 'Bearer env-secret' } }))
}

beforeEach(() => {
  vi.resetModules()
  rpc.mockReset()
  activeChallenges.mockReset()
  createAdminClient.mockReset()
  createAdminClient.mockReturnValue({ rpc })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }))
  vi.doMock('@/lib/close-periods-repo', () => ({ createClosePeriodsRepo: () => ({ activeChallenges }) }))
  process.env.CRON_SECRET = 'env-secret'
})

const groupCalls = () => rpc.mock.calls.filter((c) => c[0] === 'close_due_group_weeks')

describe('POST /api/cron/close-periods: challenges x groups', () => {
  it('challenges ok, groups ok: reports both', async () => {
    activeChallenges.mockResolvedValue([])
    rpc.mockResolvedValue({ data: 3, error: null })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closed: 0, debtsCreated: 0 })
    expect(console.log).toHaveBeenCalledWith('close-periods: closed 3 group week(s)')
    expect(groupCalls()).toHaveLength(1)
  })

  it('challenges ok, groups fail: the challenge report and status are exactly as before', async () => {
    activeChallenges.mockResolvedValue([])
    rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closed: 0, debtsCreated: 0 })
    expect(console.error).toHaveBeenCalled()
  })

  it('challenges fail, groups ok: 500 failed as before, and the groups still ran', async () => {
    activeChallenges.mockRejectedValue(new Error('db down'))
    rpc.mockResolvedValue({ data: 2, error: null })
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'failed' })
    expect(groupCalls()).toHaveLength(1)
  })

  it('challenges fail, groups fail: 500 failed, both attempted, neither hides the other', async () => {
    activeChallenges.mockRejectedValue(new Error('db down'))
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'failed' })
    expect(console.error).toHaveBeenCalled()
    expect(activeChallenges).toHaveBeenCalledTimes(1)
    expect(groupCalls()).toHaveLength(1)
  })

  it('the group call throwing instead of answering is a failed (non-fatal) group result', async () => {
    activeChallenges.mockResolvedValue([])
    rpc.mockRejectedValue(new Error('network'))
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closed: 0, debtsCreated: 0 })
    expect(console.error).toHaveBeenCalled()
  })

  it('an answer that is not a number is a failed group result, not a success', async () => {
    activeChallenges.mockResolvedValue([])
    rpc.mockResolvedValue({ data: 'three', error: null })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closed: 0, debtsCreated: 0 })
    expect(console.error).toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: 'PGRST202', message: 'Could not find the function public.close_due_group_weeks without parameters in the schema cache' }],
    [{ code: '42883', message: 'function public.close_due_group_weeks() does not exist' }],
  ])('before the migration exists ("function does not exist") it is logged and non-fatal: %j', async (error) => {
    activeChallenges.mockResolvedValue([])
    rpc.mockResolvedValue({ data: null, error })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closed: 0, debtsCreated: 0 })
    expect(console.warn).toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('the challenges run first, the groups after them, each exactly once, with the service role', async () => {
    const order: string[] = []
    activeChallenges.mockImplementation(async () => {
      order.push('challenges')
      return []
    })
    rpc.mockImplementation(async (name: string) => {
      order.push(name)
      return { data: 0, error: null }
    })
    await post()
    expect(order).toEqual(['challenges', 'close_due_group_weeks'])
    expect(createAdminClient).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('close_due_group_weeks')
  })

  describe('the group half has a 15 second limit', () => {
    afterEach(() => vi.useRealTimers())

    it('a group closing that never answers is aborted at 15 s, logged as non-fatal, and the response is unchanged', async () => {
      vi.useFakeTimers()
      activeChallenges.mockResolvedValue([])
      let signal: AbortSignal | undefined
      const builder = { abortSignal: (s: AbortSignal) => ((signal = s), builder), then: () => {} }
      rpc.mockReturnValue(builder)
      let status: number | null = null
      const pending = post().then(async (r) => {
        status = r.status
        return r.json()
      })
      await vi.advanceTimersByTimeAsync(14_999)
      expect(status).toBeNull()
      await vi.advanceTimersByTimeAsync(2)
      expect(await pending).toEqual({ closed: 0, debtsCreated: 0 })
      expect(status).toBe(200)
      expect(signal?.aborted).toBe(true)
      expect(console.warn).toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })

    it('a timeout never changes a failed challenge response either', async () => {
      vi.useFakeTimers()
      activeChallenges.mockRejectedValue(new Error('db down'))
      rpc.mockReturnValue({ then: () => {} })
      const pending = post().then(async (r) => ({ status: r.status, body: await r.json() }))
      await vi.advanceTimersByTimeAsync(15_001)
      expect(await pending).toEqual({ status: 500, body: { error: 'failed' } })
    })

    it('an answer before the limit clears the timer', async () => {
      vi.useFakeTimers()
      activeChallenges.mockResolvedValue([])
      rpc.mockResolvedValue({ data: 1, error: null })
      const res = await post()
      expect(res.status).toBe(200)
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('an unauthenticated request does neither', async () => {
    const { POST } = await import('@/app/api/cron/close-periods/route')
    const res = await POST(new Request('http://x/api/cron/close-periods', { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(activeChallenges).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('without service configuration it fails as before (500) and calls nothing', async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error('Supabase service configuration is missing')
    })
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'failed' })
    expect(activeChallenges).not.toHaveBeenCalled()
  })
})
