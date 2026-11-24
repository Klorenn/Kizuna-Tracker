import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { runStreakRisk, runWeeklySummary, type ScheduledDeps, type UserHabit } from '@/lib/scheduled-notifications'

const daysBack = (n: number, from: string) => {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return out
}
const habit = (over: Partial<UserHabit> = {}): UserHabit => ({
  id: 'h',
  name: 'Gym',
  visibility: 'public',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  frequency: { type: 'daily' },
  dates: daysBack(5, '2026-11-21'),
  ...over,
})

function deps(over: Partial<ScheduledDeps> & { habits?: Record<string, UserHabit[]> } = {}) {
  const sent: { id: string; type: string; payload: Record<string, unknown> }[] = []
  const claims: { id: string; localDate: string }[][] = []
  const d: ScheduledDeps = {
    loadTargets: vi.fn(async () => [{ id: 'cl', timezone: 'America/Santiago' }]),
    loadHabits: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, over.habits?.[id] ?? [habit()]]))),
    loadDebts: vi.fn(async () => new Map()),
    claim: vi.fn(async (_kind: string, entries: { id: string; localDate: string }[]) => {
      claims.push(entries)
      return entries.map((e: { id: string }) => e.id)
    }),
    notify: vi.fn(async (id, type, payload) => {
      sent.push({ id, type, payload })
    }),
    ...over,
  }
  return { d, sent, claims }
}

// Sunday 2026-11-22: 20:00 in Santiago (UTC-3) is 23:00Z, 21:00 is 00:00Z on the 23rd.
const EVENING = new Date('2026-11-22T23:05:00Z')

describe('runStreakRisk', () => {
  it('sends one push with the biggest streak to a user inside the 20:00 window', async () => {
    const { d, sent, claims } = deps()
    expect(await runStreakRisk(d, EVENING)).toBe(1)
    expect(sent).toEqual([{ id: 'cl', type: 'streak_risk', payload: { habit_name: 'Gym', streak: 5, more: 0 } }])
    expect(claims).toEqual([[{ id: 'cl', localDate: '2026-11-22' }]])
  })
  it('asks the targets for the streak_risk kind (opt-out lives in the target list)', async () => {
    const { d } = deps()
    await runStreakRisk(d, EVENING)
    expect(d.loadTargets).toHaveBeenCalledWith('streak_risk')
  })
  it('does nothing and loads no habits outside the window', async () => {
    const { d, sent } = deps()
    expect(await runStreakRisk(d, new Date('2026-11-22T23:20:00Z'))).toBe(0)
    expect(d.loadHabits).not.toHaveBeenCalled()
    expect(sent).toEqual([])
  })
  it('only loads habits for the users in their window (other zones are skipped)', async () => {
    const { d } = deps({
      loadTargets: vi.fn(async () => [
        { id: 'cl', timezone: 'America/Santiago' },
        { id: 'es', timezone: 'Europe/Madrid' },
      ]),
    })
    await runStreakRisk(d, EVENING)
    expect(d.loadHabits).toHaveBeenCalledWith(['cl'], 'streak-risk')
  })
  it('does not claim or send when nothing is at risk', async () => {
    const { d, sent, claims } = deps({ habits: { cl: [habit({ dates: [...daysBack(5, '2026-11-22')] })] } })
    expect(await runStreakRisk(d, EVENING)).toBe(0)
    expect(sent).toEqual([])
    expect(claims).toEqual([])
  })
  it('never notifies a user whose claim was lost (already sent today)', async () => {
    const { d, sent } = deps({ claim: vi.fn(async () => []) })
    expect(await runStreakRisk(d, EVENING)).toBe(0)
    expect(sent).toEqual([])
  })
  it('claims under the streak_risk kind', async () => {
    const { d } = deps()
    await runStreakRisk(d, EVENING)
    expect(d.claim).toHaveBeenCalledWith('streak_risk', [{ id: 'cl', localDate: '2026-11-22' }])
  })
  it('counts the other habits at risk', async () => {
    const { d, sent } = deps({ habits: { cl: [habit({ id: 'a' }), habit({ id: 'b', name: 'Leer', dates: daysBack(3, '2026-11-21') })] } })
    await runStreakRisk(d, EVENING)
    expect(sent[0].payload).toEqual({ habit_name: 'Gym', streak: 5, more: 1 })
  })
})

describe('runWeeklySummary', () => {
  const SUNDAY_NIGHT = new Date('2026-11-23T00:03:00Z') // Sunday 21:03 in Santiago
  it('sends the summary at Sunday 21:00 local', async () => {
    const { d, sent, claims } = deps()
    expect(await runWeeklySummary(d, SUNDAY_NIGHT)).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('weekly_summary')
    expect(sent[0].payload).toMatchObject({ done: 5, due: 7, best_streak: 5, best_habit: 'Gym', won: 0, lost: 0, balance: 0 })
    expect(claims).toEqual([[{ id: 'cl', localDate: '2026-11-22' }]])
    expect(d.claim).toHaveBeenCalledWith('weekly_summary', expect.anything())
  })
  it('skips every other day', async () => {
    const { d } = deps()
    expect(await runWeeklySummary(d, new Date('2026-11-24T00:03:00Z'))).toBe(0) // Monday 21:03? Sunday->Monday: Mon 21:03 local
    expect(d.loadHabits).not.toHaveBeenCalled()
  })
  it('passes debts and the clock to the loader', async () => {
    const { d } = deps()
    await runWeeklySummary(d, SUNDAY_NIGHT)
    expect(d.loadDebts).toHaveBeenCalledWith(['cl'], SUNDAY_NIGHT)
  })
  it('puts the net balance and challenge results in the payload', async () => {
    const { d, sent } = deps({
      loadDebts: vi.fn(async () => new Map([['cl', [{ debtorId: 'cl', creditorId: 'f', amount: 2000, paidAt: null, createdAt: '2026-11-18T12:00:00Z' }]]])),
    })
    await runWeeklySummary(d, SUNDAY_NIGHT)
    expect(sent[0].payload).toMatchObject({ lost: 1, balance: -2000 })
  })
  it('sends nothing to a user with no habits', async () => {
    const { d, sent, claims } = deps({ habits: { cl: [] } })
    expect(await runWeeklySummary(d, SUNDAY_NIGHT)).toBe(0)
    expect(sent).toEqual([])
    expect(claims).toEqual([])
  })
  it('does not notify users that lost the claim', async () => {
    const { d, sent } = deps({ claim: vi.fn(async () => []) })
    expect(await runWeeklySummary(d, SUNDAY_NIGHT)).toBe(0)
    expect(sent).toEqual([])
  })
})
