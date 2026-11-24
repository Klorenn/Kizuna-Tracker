import { beforeEach, describe, expect, it, vi } from 'vitest'

// Both cron routes authenticate through authorizeCronRequest. A missing `await` there would negate a
// Promise (always truthy) and accept every request, so each route is pinned on all five outcomes.
const HEX = 'c'.repeat(64)
const rpc = vi.fn()

const routes = [
  { name: 'close-periods', load: () => import('@/app/api/cron/close-periods/route') },
  { name: 'reminders', load: () => import('@/app/api/cron/reminders/route') },
]

describe.each(routes)('POST /api/cron/$name authentication', ({ name, load }) => {
  beforeEach(() => {
    vi.resetModules()
    rpc.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }))
    vi.doMock('@/lib/close-periods-repo', () => ({ createClosePeriodsRepo: () => ({}) }))
    vi.doMock('@/lib/close-periods', () => ({ closeDuePeriods: async () => ({ closed: 0, debtsCreated: 0 }), closeGroupWeeks: async () => ({ closed: 0 }) }))
    vi.doMock('@/lib/notify', () => ({ notify: async () => {}, pushPendingNotifications: async () => 0 }))
    vi.doMock('@/lib/reminders', () => ({ dueReminderEntries: () => [] }))
    vi.doMock('@/lib/reminders-repo', () => ({ loadReminderCandidates: async () => [], claimReminders: async () => [] }))
    vi.doMock('@/lib/scheduled-notifications', () => ({ runScheduledNotifications: async () => ({ streakRisk: 0, weeklySummary: 0 }) }))
    process.env.CRON_SECRET = 'env-secret'
  })

  async function post(auth?: string) {
    const { POST } = await load()
    return POST(new Request(`http://x/api/cron/${name}`, { method: 'POST', headers: auth ? { authorization: auth } : {} }))
  }

  it('declares a long enough maxDuration for the evening pushes', async () => {
    if (name !== 'reminders') return
    const mod = (await load()) as { maxDuration?: number }
    expect(mod.maxDuration).toBe(60)
  })

  it('no header -> 401', async () => {
    expect((await post()).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('wrong token -> 401', async () => {
    expect((await post('Bearer nope')).status).toBe(401)
  })

  it('wrong 64-hex token the database rejects -> 401', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect((await post(`Bearer ${HEX}`)).status).toBe(401)
  })

  it('valid env secret -> 200', async () => {
    expect((await post('Bearer env-secret')).status).toBe(200)
    // an env-secret request performs no database secret check
    expect(rpc).not.toHaveBeenCalledWith('cron_secret_valid', expect.anything())
  })

  it('valid database secret -> 200', async () => {
    delete process.env.CRON_SECRET
    rpc.mockResolvedValue({ data: true, error: null })
    expect((await post(`Bearer ${HEX}`)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('cron_secret_valid', { p_secret: HEX })
  })

  it('database RPC error -> 401', async () => {
    delete process.env.CRON_SECRET
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect((await post(`Bearer ${HEX}`)).status).toBe(401)
  })
})
