import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDuePeriods, type ActiveChallenge, type ClosePeriodsRepo } from '@/lib/close-periods'

const CREATOR = 'creator'
const RIVAL = 'rival'
const CH = 'ch1'

type Checkin = { habitId: string; localDate: string; createdAt: Date; photo: boolean; rejected: boolean }

function challenge(over: Partial<ActiveChallenge> = {}): ActiveChallenge {
  return {
    id: CH,
    creatorId: CREATOR,
    rivalId: RIVAL,
    creatorHabitId: 'hc',
    rivalHabitId: 'hr',
    frequency: { type: 'weekly', target: 4 },
    weeks: 4,
    fineAmount: 4500,
    startsOn: '2026-11-23',
    timezone: 'America/Santiago',
    cancelledAt: null,
    ...over,
  }
}

function days(habitId: string, dates: string[], over: Partial<Checkin> = {}): Checkin[] {
  return dates.map((d) => ({
    habitId,
    localDate: d,
    createdAt: new Date(`${d}T15:00:00Z`),
    photo: false,
    rejected: false,
    ...over,
  }))
}

function memoryRepo(challenges: ActiveChallenge[], checkins: Checkin[]) {
  const periods = new Set<string>()
  const debts = new Map<string, { debtorId: string; creditorId: string; amount: number }>()
  const notifications: { userId: string; type: string; payload: Record<string, unknown> }[] = []
  const finished: string[] = []
  const calls = { photo: 0 }
  const repo: ClosePeriodsRepo = {
    activeChallenges: async () => challenges.filter((c) => !finished.includes(c.id)),
    closedPeriodStarts: async (id) =>
      [...periods].filter((k) => k.startsWith(`${id}|`)).map((k) => k.split('|')[1]),
    checkinDates: async (habitId, from, to) =>
      checkins
        .filter((k) => k.habitId === habitId && !k.rejected && k.localDate >= from && k.localDate <= to)
        .map((k) => k.localDate),
    photoCheckins: async (habitIds, from, to) => {
      calls.photo++
      return checkins
        .filter((k) => habitIds.includes(k.habitId) && k.photo && !k.rejected && k.localDate >= from && k.localDate <= to)
        .map((k) => ({ localDate: k.localDate, createdAt: k.createdAt }))
    },
    insertPeriod: async (id, p) => {
      const key = `${id}|${p.start}`
      if (periods.has(key)) return false
      periods.add(key)
      return true
    },
    insertDebt: async (d) => {
      const key = `${d.challengeId}|${d.periodStart}|${d.debtorId}`
      if (debts.has(key)) return false
      debts.set(key, { debtorId: d.debtorId, creditorId: d.creditorId, amount: d.amount })
      return true
    },
    finishChallenge: async (id) => {
      finished.push(id)
    },
    insertNotification: async (userId, type, payload) => {
      notifications.push({ userId, type, payload })
    },
  }
  return { repo, periods, debts, notifications, finished, calls }
}

const NOW = new Date('2026-12-01T12:00:00Z') // first week (23 nov to 29 nov) is over, second is not

const week1 = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']

describe('closeDuePeriods', () => {
  let creatorTarget3: Checkin[]
  beforeEach(() => {
    creatorTarget3 = days('hc', week1.slice(0, 3))
  })

  it('creates a debt for the one who failed, and notifies the debtor', async () => {
    const m = memoryRepo([challenge()], [...creatorTarget3, ...days('hr', week1)])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect([...m.debts.values()]).toEqual([{ debtorId: CREATOR, creditorId: RIVAL, amount: 4500 }])
    expect(m.notifications).toHaveLength(1)
    expect(m.notifications[0]).toMatchObject({ userId: CREATOR, type: 'new_debt' })
    expect(m.notifications[0].payload).toMatchObject({ challenge_id: CH, creditor_id: RIVAL, amount: 4500 })
  })

  it('creates two debts when both fail', async () => {
    const m = memoryRepo([challenge()], [])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 2 })
    expect(m.notifications).toHaveLength(2)
  })

  it('creates no debts when both complete', async () => {
    const m = memoryRepo([challenge()], [...days('hc', week1), ...days('hr', week1)])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 0 })
    expect(m.notifications).toHaveLength(0)
  })

  it('is idempotent on a second run', async () => {
    const m = memoryRepo([challenge()], [])
    await closeDuePeriods(m.repo, NOW)
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 0 })
    expect(m.debts.size).toBe(2)
    expect(m.notifications).toHaveLength(2)
  })

  it('does not close while a photo can still be rejected', async () => {
    const photo = days('hr', ['2026-11-29'], { photo: true, createdAt: new Date('2026-11-30T23:00:00Z') })
    const m = memoryRepo([challenge()], [...photo])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 0 })
    expect(m.periods.size).toBe(0)
  })

  it('does not count a rejected check-in', async () => {
    const four = days('hc', week1)
    four[0].rejected = true
    const m = memoryRepo([challenge()], [...four, ...days('hr', week1)])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect([...m.debts.values()][0].debtorId).toBe(CREATOR)
  })

  it('finishes the challenge after the last period', async () => {
    const m = memoryRepo([challenge({ weeks: 1 })], [...days('hc', week1), ...days('hr', week1)])
    await closeDuePeriods(m.repo, NOW)
    expect(m.finished).toEqual([CH])
  })

  it('does not finish while periods remain', async () => {
    const m = memoryRepo([challenge()], [])
    await closeDuePeriods(m.repo, NOW)
    expect(m.finished).toEqual([])
  })

  it('closes daily periods one by one', async () => {
    const m = memoryRepo(
      [challenge({ frequency: { type: 'daily' }, weeks: 1, startsOn: '2026-11-23' })],
      [...days('hc', ['2026-11-23']), ...days('hr', ['2026-11-23', '2026-11-24'])],
    )
    const r = await closeDuePeriods(m.repo, new Date('2026-11-25T12:00:00Z'))
    // 23 and 24 closed: 23 both ok; 24 creator failed
    expect(r).toEqual({ closed: 2, debtsCreated: 1 })
  })

  it('a retry after a crash between debt and period does not duplicate the debt', async () => {
    const m = memoryRepo([challenge()], [])
    const original = m.repo.insertPeriod
    m.repo.insertPeriod = async () => {
      throw new Error('boom')
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 2 })
    log.mockRestore()
    m.repo.insertPeriod = original
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 0 })
    expect(m.debts.size).toBe(2)
    expect(m.notifications).toHaveLength(2)
  })
})

describe('cancelled challenges', () => {
  it('still bills a period that ended before the cancel, never finishes it', async () => {
    // cancelled 30 nov 12:00 Santiago; week 1 (23-29 nov) had ended, week 2 was in progress
    const m = memoryRepo([challenge({ cancelledAt: new Date('2026-11-30T15:00:00Z') })], [])
    await expect(closeDuePeriods(m.repo, new Date('2026-12-20T12:00:00Z'))).resolves.toEqual({ closed: 1, debtsCreated: 2 })
    expect([...m.periods]).toEqual([`${CH}|2026-11-23`])
    expect(m.finished).toEqual([])
  })

  it('bills nothing when cancelled during the first period', async () => {
    const m = memoryRepo([challenge({ cancelledAt: new Date('2026-11-25T15:00:00Z') })], [])
    await expect(closeDuePeriods(m.repo, new Date('2026-12-20T12:00:00Z'))).resolves.toEqual({ closed: 0, debtsCreated: 0 })
  })
})

describe('cron cost and isolation', () => {
  it('does no per-challenge queries for periods that have not ended', async () => {
    const m = memoryRepo([challenge()], [])
    await closeDuePeriods(m.repo, new Date('2026-11-25T12:00:00Z'))
    expect(m.calls.photo).toBe(0)
  })

  it('fetches check-ins and photos once per challenge', async () => {
    const m = memoryRepo([challenge()], [])
    await closeDuePeriods(m.repo, new Date('2026-12-20T12:00:00Z'))
    expect(m.calls.photo).toBe(1)
  })

  it('one failing challenge does not stop the others', async () => {
    const m = memoryRepo([challenge({ id: 'bad' }), challenge({ id: 'good' })], [])
    const orig = m.repo.checkinDates
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    // only the first challenge throws
    let first = true
    m.repo.checkinDates = async (...a) => {
      if (first) {
        first = false
        throw new Error('db down')
      }
      return orig(...a)
    }
    const r = await closeDuePeriods(m.repo, NOW)
    expect(r.debtsCreated).toBe(2)
    expect([...m.periods]).toEqual(['good|2026-11-23'])
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('POST /api/cron/close-periods', () => {
  const run = vi.fn(async () => ({ closed: 0, debtsCreated: 0 }))
  beforeEach(() => {
    vi.resetModules()
    run.mockClear()
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
    vi.doMock('@/lib/close-periods-repo', () => ({ createClosePeriodsRepo: () => ({}) }))
    vi.doMock('@/lib/close-periods', async (orig) => ({ ...(await orig<object>()), closeDuePeriods: run }))
    process.env.CRON_SECRET = 'shh'
  })

  async function post(auth?: string) {
    const { POST } = await import('@/app/api/cron/close-periods/route')
    return POST(new Request('http://x/api/cron/close-periods', { method: 'POST', headers: auth ? { authorization: auth } : {} }))
  }

  it('rejects a missing secret', async () => {
    expect((await post()).status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })
  it('rejects a wrong secret', async () => {
    expect((await post('Bearer nope')).status).toBe(401)
  })
  it('rejects everything when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    expect((await post('Bearer ')).status).toBe(401)
  })
  it('runs with the right secret', async () => {
    const res = await post('Bearer shh')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closed: 0, debtsCreated: 0 })
  })
})
