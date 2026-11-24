import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChallengeItemSpec } from '@/domain/challenges'
import type { Frequency } from '@/domain/types'
import { closeDuePeriods, type ActiveChallenge, type ClosePeriodsRepo, type NewItemResult } from '@/lib/close-periods'

const CREATOR = 'creator'
const RIVAL = 'rival'
const CH = 'ch1'

type Checkin = { habitId: string; localDate: string; createdAt: Date; photo: boolean; rejected: boolean }

/** Test sugar: `frequency` / `requiresPhoto` describe the single legacy item; pass `items` for several. */
function challenge(
  over: Partial<ActiveChallenge> & { frequency?: Frequency; requiresPhoto?: boolean } = {},
): ActiveChallenge {
  const { frequency = { type: 'weekly', target: 4 }, requiresPhoto = false, ...rest } = over
  const startsOn = rest.startsOn ?? '2026-11-23'
  return {
    id: CH,
    creatorId: CREATOR,
    rivalId: RIVAL,
    frequencyType: frequency.type,
    weeks: 4,
    fineAmount: 4500,
    startsOn,
    timezone: 'America/Santiago',
    cancelledAt: null,
    items: [item('i1', { frequency, requiresPhoto, startsOn })],
    ...rest,
  }
}

function item(id: string, over: Partial<ChallengeItemSpec> = {}): ChallengeItemSpec {
  return {
    id,
    creatorHabitId: id === 'i1' ? 'hc' : `hc-${id}`,
    rivalHabitId: id === 'i1' ? 'hr' : `hr-${id}`,
    frequency: { type: 'weekly', target: 4 },
    requiresPhoto: false,
    startsOn: '2026-11-23',
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
  const settled: string[] = []
  const itemResults = new Map<string, NewItemResult>()
  const events: string[] = []
  const calls = { photo: 0 }
  const repo: ClosePeriodsRepo = {
    activeChallenges: async () => challenges.filter((c) => !finished.includes(c.id) && !settled.includes(c.id)),
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
        .map((k) => ({ habitId: k.habitId, localDate: k.localDate, createdAt: k.createdAt }))
    },
    insertItemResults: async (rows) => {
      events.push('results')
      for (const r of rows) {
        const key = `${r.challengeId}|${r.periodStart}|${r.itemId}|${r.playerId}`
        if (!itemResults.has(key)) itemResults.set(key, r)
      }
    },
    insertPeriod: async (id, p) => {
      events.push('period')
      const key = `${id}|${p.start}`
      if (periods.has(key)) return false
      periods.add(key)
      return true
    },
    insertDebt: async (d) => {
      events.push('debt')
      const key = `${d.challengeId}|${d.periodStart}|${d.debtorId}`
      if (debts.has(key)) return false
      debts.set(key, { debtorId: d.debtorId, creditorId: d.creditorId, amount: d.amount })
      return true
    },
    finishChallenge: async (id) => {
      finished.push(id)
    },
    settleChallenge: async (id) => {
      settled.push(id)
    },
    insertNotification: async (userId, type, payload) => {
      notifications.push({ userId, type, payload })
    },
  }
  return { repo, periods, debts, notifications, finished, settled, calls, itemResults, events }
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
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 0 })
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
    expect(m.settled).toEqual([CH])
  })

  it('settles once nothing is left to bill, so later runs skip it', async () => {
    const m = memoryRepo([challenge({ cancelledAt: new Date('2026-11-30T15:00:00Z') })], [])
    await closeDuePeriods(m.repo, new Date('2026-12-20T12:00:00Z'))
    expect(m.settled).toEqual([CH])
    await expect(closeDuePeriods(m.repo, new Date('2026-12-21T12:00:00Z'))).resolves.toEqual({ closed: 0, debtsCreated: 0 })
    expect(m.calls.photo).toBe(1)
  })

  it('does not settle while an ended period still waits for the photo window', async () => {
    // cancelled 1 dec 08:00 Santiago: week 1 is billable, but a photo of 29 nov is still rejectable
    const photo = days('hr', ['2026-11-29'], { photo: true, createdAt: new Date('2026-11-30T23:00:00Z') })
    const m = memoryRepo([challenge({ cancelledAt: new Date('2026-12-01T11:00:00Z') })], photo)
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 0 })
    expect(m.settled).toEqual([])
  })

  it('never settles a challenge that is still active', async () => {
    const m = memoryRepo([challenge({ weeks: 1 })], [])
    await closeDuePeriods(m.repo, NOW)
    expect(m.settled).toEqual([])
    expect(m.finished).toEqual([CH])
  })
})

describe('photo challenges', () => {
  it('counts only photo check-ins: a day completed through steps does not meet the goal', async () => {
    const m = memoryRepo(
      [challenge({ requiresPhoto: true })],
      [...days('hc', week1), ...days('hr', week1, { photo: true })],
    )
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect([...m.debts.values()]).toEqual([{ debtorId: CREATOR, creditorId: RIVAL, amount: 4500 }])
  })

  it('both meet the goal with photos', async () => {
    const m = memoryRepo(
      [challenge({ requiresPhoto: true })],
      [...days('hc', week1, { photo: true }), ...days('hr', week1, { photo: true })],
    )
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 0 })
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


describe('sub-retos (several items)', () => {
  const NOW2 = new Date('2026-12-08T12:00:00Z') // weeks 1 (23 nov) and 2 (30 nov) are over, week 3 is not
  const week2 = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03']
  const two = (over: Partial<ChallengeItemSpec> = {}) => [item('i1'), item('i2', over)]

  it('a player who fails ANY item loses the period, with exactly one debt', async () => {
    // creator meets i1 but fails i2 and i1... only i2 missing; rival meets both
    const m = memoryRepo(
      [challenge({ items: two() })],
      [...days('hc', week1), ...days('hr', week1), ...days('hc-i2', week1.slice(0, 1)), ...days('hr-i2', week1)],
    )
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect([...m.debts.values()]).toEqual([{ debtorId: CREATOR, creditorId: RIVAL, amount: 4500 }])
  })

  it('failing two items still costs one debt per player', async () => {
    const m = memoryRepo([challenge({ items: two() })], [...days('hr', week1), ...days('hr-i2', week1)])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect(m.debts.size).toBe(1)
    expect(m.notifications).toHaveLength(1)
  })

  it('both players failing different items: one debt each', async () => {
    const m = memoryRepo(
      [challenge({ items: two() })],
      [...days('hc', week1), ...days('hr', week1), ...days('hc-i2', week1), ...days('hr-i2', week1.slice(0, 2))],
    )
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect([...m.debts.values()][0].debtorId).toBe(RIVAL)
    const m2 = memoryRepo([challenge({ items: two() })], [...days('hc', week1), ...days('hr-i2', week1)])
    await expect(closeDuePeriods(m2.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 2 })
  })

  it('all items met: no debt', async () => {
    const all = [...days('hc', week1), ...days('hr', week1), ...days('hc-i2', week1), ...days('hr-i2', week1)]
    const m = memoryRepo([challenge({ items: two() })], all)
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 0 })
  })

  it('an item added mid-challenge counts only from its own start', async () => {
    // i2 starts in week 2: week 1 ignores it (nobody fails), week 2 evaluates it
    const items = two({ startsOn: '2026-11-30' })
    const m = memoryRepo([challenge({ items })], [...days('hc', [...week1, ...week2]), ...days('hr', [...week1, ...week2])])
    await expect(closeDuePeriods(m.repo, NOW2)).resolves.toEqual({ closed: 2, debtsCreated: 2 })
    const keys = [...m.itemResults.keys()]
    expect(keys.filter((k) => k.includes('|2026-11-23|') && k.includes('|i2|'))).toEqual([])
    expect(keys.filter((k) => k.includes('|2026-11-30|') && k.includes('|i2|'))).toHaveLength(2)
    expect(keys.filter((k) => k.includes('|2026-11-23|') && k.includes('|i1|'))).toHaveLength(2)
    // week 2: both players miss the new item
    expect([...m.debts.keys()].every((k) => k.includes('|2026-11-30|'))).toBe(true)
  })

  it('writes item results (done / needed / met) per item and player', async () => {
    const m = memoryRepo([challenge({ items: two() })], [...days('hc', week1), ...days('hr', week1.slice(0, 2))])
    await closeDuePeriods(m.repo, NOW)
    expect(m.itemResults.get(`${CH}|2026-11-23|i1|${CREATOR}`)).toEqual({
      challengeId: CH, periodStart: '2026-11-23', itemId: 'i1', playerId: CREATOR, met: true, done: 4, needed: 4,
    })
    expect(m.itemResults.get(`${CH}|2026-11-23|i1|${RIVAL}`)).toMatchObject({ met: false, done: 2, needed: 4 })
    expect(m.itemResults.get(`${CH}|2026-11-23|i2|${CREATOR}`)).toMatchObject({ met: false, done: 0, needed: 4 })
  })

  it('writes the item results BEFORE the debts, and the period row last', async () => {
    const m = memoryRepo([challenge({ items: two() })], [])
    await closeDuePeriods(m.repo, NOW)
    expect(m.events).toEqual(['results', 'debt', 'debt', 'period'])
  })

  it('a rerun does not duplicate item results or debts', async () => {
    const m = memoryRepo([challenge({ items: two() })], [])
    await closeDuePeriods(m.repo, NOW)
    const results = m.itemResults.size
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 0 })
    expect(m.itemResults.size).toBe(results)
    expect(m.debts.size).toBe(2)
  })

  it('a crash after the item results but before the period is repaired by the rerun', async () => {
    const m = memoryRepo([challenge({ items: two() })], [])
    const original = m.repo.insertPeriod
    m.repo.insertPeriod = async () => {
      throw new Error('boom')
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await closeDuePeriods(m.repo, NOW)
    log.mockRestore()
    expect(m.itemResults.size).toBe(4)
    m.repo.insertPeriod = original
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 0 })
    expect(m.itemResults.size).toBe(4)
    expect(m.debts.size).toBe(2)
  })

  it('the new_debt notification names the failed items', async () => {
    const m = memoryRepo([challenge({ items: two() })], [...days('hc', week1), ...days('hr', week1), ...days('hr-i2', week1)])
    await closeDuePeriods(m.repo, NOW)
    expect(m.notifications).toHaveLength(1)
    expect(m.notifications[0]).toMatchObject({ userId: CREATOR, type: 'new_debt' })
    expect(m.notifications[0].payload).toMatchObject({ challenge_id: CH, item_ids: ['i2'] })
  })

  it('photo items count only non-rejected photo check-ins; plain items count any check-in', async () => {
    const items = [item('i1', { requiresPhoto: true }), item('i2')]
    const m = memoryRepo(
      [challenge({ items })],
      [
        ...days('hc', week1), // i1 creator: no photos -> fails
        ...days('hr', week1, { photo: true }),
        ...days('hc-i2', week1), // i2: plain check-ins are enough
        ...days('hr-i2', week1),
      ],
    )
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect([...m.debts.values()][0].debtorId).toBe(CREATOR)
    expect(m.itemResults.get(`${CH}|2026-11-23|i1|${CREATOR}`)).toMatchObject({ met: false, done: 0 })
  })

  it('a rejected photo of a photo item does not count', async () => {
    const items = [item('i1', { requiresPhoto: true })]
    const photos = days('hc', week1, { photo: true })
    photos[0].rejected = true
    const m = memoryRepo([challenge({ items })], [...photos, ...days('hr', week1, { photo: true })])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
  })

  it('waits for the photo window of ANY applicable item, and loads photos once per challenge', async () => {
    const items = two({ requiresPhoto: true })
    const photo = days('hr-i2', ['2026-11-29'], { photo: true, createdAt: new Date('2026-11-30T23:00:00Z') })
    const m = memoryRepo([challenge({ items })], photo)
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 0 })
    expect(m.calls.photo).toBe(1)
  })

  it('does not wait for the photos of an item that has not started', async () => {
    const items = two({ requiresPhoto: true, startsOn: '2026-11-30' })
    const photo = days('hr-i2', ['2026-11-29'], { photo: true, createdAt: new Date('2026-11-30T23:00:00Z') })
    const m = memoryRepo([challenge({ items })], photo)
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toMatchObject({ closed: 1 })
  })

  it('a legacy challenge (one item, no results before) produces the same output as before', async () => {
    const m = memoryRepo([challenge()], [...days('hc', week1.slice(0, 3)), ...days('hr', week1)])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 1, debtsCreated: 1 })
    expect([...m.debts.values()]).toEqual([{ debtorId: CREATOR, creditorId: RIVAL, amount: 4500 }])
    expect(m.notifications[0].payload).toMatchObject({ challenge_id: CH, creditor_id: RIVAL, amount: 4500, item_ids: ['i1'] })
  })

  it('a challenge without active items closes nothing and never finishes', async () => {
    const m = memoryRepo([challenge({ items: [] })], [])
    await expect(closeDuePeriods(m.repo, NOW)).resolves.toEqual({ closed: 0, debtsCreated: 0 })
    expect(m.finished).toEqual([])
  })
})
