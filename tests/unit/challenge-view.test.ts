import { describe, expect, it } from 'vitest'
import { challengeFrequency, countDone, frequencyLabel, periodStatus } from '@/lib/challenge-view'

const weekly = { frequency_type: 'weekly', target_per_week: 4, weeks: 8, starts_on: '2026-11-02' }
const daily = { frequency_type: 'daily', target_per_week: null, weeks: 2, starts_on: '2026-11-02' }

describe('challenge view helpers', () => {
  it('builds the frequency and its label', () => {
    expect(challengeFrequency(weekly)).toEqual({ type: 'weekly', target: 4 })
    expect(challengeFrequency(daily)).toEqual({ type: 'daily' })
    expect(frequencyLabel({ type: 'weekly', target: 4 })).toBe('4 por semana')
    expect(frequencyLabel({ type: 'daily' })).toBe('Diario')
  })

  it('locates the current period', () => {
    expect(periodStatus(weekly, '2026-11-18')).toMatchObject({
      state: 'running',
      index: 3,
      total: 8,
      period: { start: '2026-11-16', end: '2026-11-22' },
    })
    expect(periodStatus(daily, '2026-11-05')).toMatchObject({ state: 'running', index: 4, total: 14 })
  })

  it('knows before the start and after the end', () => {
    expect(periodStatus(weekly, '2026-11-01')).toMatchObject({ state: 'pending', total: 8 })
    expect(periodStatus(weekly, '2027-02-01')).toMatchObject({ state: 'over', total: 8 })
    expect(periodStatus({ ...weekly, starts_on: null }, '2026-11-18').state).toBe('pending')
  })

  it('counts distinct dates inside a period', () => {
    const p = { start: '2026-11-16', end: '2026-11-22' }
    expect(countDone(p, ['2026-11-15', '2026-11-16', '2026-11-16', '2026-11-22', '2026-11-23'])).toBe(2)
  })
})

import { dayMonthLabel, endsOn, firstName, weekdayLabel } from '@/lib/challenge-view'

describe('labels', () => {
  it('formats dates in Spanish without timezone drift', () => {
    expect(weekdayLabel('2026-11-29')).toBe('dom 29')
    expect(weekdayLabel('2026-11-23')).toBe('lun 23')
    expect(dayMonthLabel('2026-11-02')).toBe('2 nov')
  })

  it('finds the last day and the first name', () => {
    expect(endsOn(weekly)).toBe('2026-12-27')
    expect(endsOn({ ...weekly, starts_on: null })).toBeNull()
    expect(firstName('Caro Pérez')).toBe('Caro')
    expect(firstName(null)).toBe('Tu amigo')
  })
})

import { cancelledLabel } from '@/lib/challenge-view'

describe('cancelledLabel', () => {
  it('names the cause when known', () => {
    expect(cancelledLabel({ starts_on: null, cancel_requested_by: null })).toBe('Propuesta retirada')
    expect(cancelledLabel({ starts_on: '2026-11-02', cancel_requested_by: 'u' })).toBe('Cancelado entre los dos')
    expect(cancelledLabel({ starts_on: '2026-11-02', cancel_requested_by: null })).toBe('Cancelado')
  })
})

import { failureHistory } from '@/lib/challenge-view'
import { periodsFor } from '@/domain/challenges'

describe('failureHistory (built from debts, readable by both players)', () => {
  const ME = 'me'
  const THEM = 'them'
  const weekly = { type: 'weekly' as const, target: 3 }
  const periods = periodsFor('2026-11-02', 4, weekly) // 2, 9, 16, 23 nov
  const debt = (period_start: string, debtor_id: string, paid_at: string | null = null) => ({
    period_start,
    debtor_id,
    amount: 2500,
    paid_at,
  })
  const base = {
    periods,
    closedStarts: ['2026-11-02', '2026-11-09'],
    otherName: 'Ana',
    frequency: weekly,
    myId: ME,
  }

  it('trusts the ledger once the rival is no longer a friend (no phantom debts)', () => {
    // my week 1 failure is in the ledger; their check-ins are invisible now (null)
    const rows = failureHistory({
      ...base,
      debts: [debt('2026-11-02', ME)],
      myDates: ['2026-11-10', '2026-11-11', '2026-11-12'],
      theirDates: null,
    })
    expect(rows).toEqual([
      { start: '2026-11-09', n: 2, summary: 'Los dos cumplieron', debt: null },
      { start: '2026-11-02', n: 1, summary: 'Hiciste 0 de 3', debt: { amount: 2500, paid: false } },
    ])
  })

  it('names the rival and their count while it is visible, and takes paid state from the debt', () => {
    const rows = failureHistory({
      ...base,
      closedStarts: ['2026-11-02'],
      debts: [debt('2026-11-02', THEM, '2026-11-10T12:00:00Z')],
      myDates: [],
      theirDates: ['2026-11-03'],
    })
    expect(rows).toEqual([{ start: '2026-11-02', n: 1, summary: 'Ana hizo 1 de 3', debt: { amount: 2500, paid: true } }])
  })

  it('falls back to "no cumplió" when the rival count is hidden or does not match the ledger', () => {
    const hidden = failureHistory({ ...base, closedStarts: ['2026-11-02'], debts: [debt('2026-11-02', THEM)], myDates: [], theirDates: null })
    expect(hidden[0].summary).toBe('Ana no cumplió')
    const mismatch = failureHistory({
      ...base,
      closedStarts: ['2026-11-02'],
      debts: [debt('2026-11-02', ME)],
      myDates: ['2026-11-02', '2026-11-03', '2026-11-04'],
      theirDates: [],
    })
    expect(mismatch[0].summary).toBe('No cumpliste')
  })

  it('shows both failures as compensated, without an amount', () => {
    const rows = failureHistory({
      ...base,
      closedStarts: ['2026-11-02'],
      debts: [debt('2026-11-02', ME), debt('2026-11-02', THEM)],
      myDates: [],
      theirDates: [],
    })
    expect(rows).toEqual([{ start: '2026-11-02', n: 1, summary: 'Fallaron los dos · se compensa', debt: null }])
  })

  it('uses daily wording and includes a billed period whose closed row is missing', () => {
    const daily = { type: 'daily' as const }
    const rows = failureHistory({
      ...base,
      frequency: daily,
      periods: periodsFor('2026-11-02', 1, daily),
      closedStarts: ['2026-11-02'],
      debts: [debt('2026-11-03', THEM)],
      myDates: [],
      theirDates: [],
    })
    expect(rows.map((r) => [r.start, r.n, r.summary])).toEqual([
      ['2026-11-03', 2, 'Ana no cumplió'],
      ['2026-11-02', 1, 'Los dos cumplieron'],
    ])
  })

  it('lists the newest periods first, at most 12', () => {
    const daily = { type: 'daily' as const }
    const all = periodsFor('2026-11-02', 2, daily)
    const rows = failureHistory({
      ...base,
      frequency: daily,
      periods: all,
      closedStarts: all.map((p) => p.start),
      debts: [],
      myDates: [],
      theirDates: [],
    })
    expect(rows).toHaveLength(12)
    expect(rows[0]).toMatchObject({ start: '2026-11-15', n: 14 })
  })
})

import { itemProgress, itemViews, subRetosLabel } from '@/lib/challenge-view'

describe('itemViews (live sub-retos seen from one player)', () => {
  const ME = 'me'
  const row = (o: Partial<Parameters<typeof itemViews>[0][number]>) => ({
    id: 'i1',
    position: 1,
    status: 'active',
    creator_habit_id: 'hc',
    rival_habit_id: 'hr',
    target_per_week: 3,
    requires_photo: false,
    proposed_by: 'me',
    starts_on: '2026-11-02',
    ...o,
  })

  it('keeps only live items in position order and orients habits to the viewer', () => {
    const items = [
      row({ id: 'i3', position: 3, status: 'withdrawn' }),
      row({ id: 'i2', position: 2, status: 'proposed', creator_habit_id: 'hc2', rival_habit_id: null, proposed_by: 'them' }),
      row({ id: 'i1', position: 1 }),
      row({ id: 'i4', position: 4, status: 'declined' }),
    ]
    const asCreator = itemViews(items, { creator_id: ME }, ME)
    expect(asCreator.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(asCreator[0]).toMatchObject({ myHabitId: 'hc', theirHabitId: 'hr', pendingFor: null })
    const asRival = itemViews(items, { creator_id: 'them' }, ME)
    expect(asRival[0]).toMatchObject({ myHabitId: 'hr', theirHabitId: 'hc' })
  })

  it('says who must answer a proposed item: the non-proposer', () => {
    const proposedByMe = row({ status: 'proposed', rival_habit_id: null, proposed_by: ME })
    const proposedByThem = row({ id: 'i2', position: 2, status: 'proposed', rival_habit_id: null, proposed_by: 'them' })
    const [a, b] = itemViews([proposedByMe, proposedByThem], { creator_id: ME }, ME)
    expect(a.pendingFor).toBe('them')
    expect(b.pendingFor).toBe('me')
  })
})

describe('itemProgress', () => {
  const period = { start: '2026-11-09', end: '2026-11-15' }
  const view = (o = {}) => ({
    id: 'i1',
    position: 1,
    status: 'active' as const,
    myHabitId: 'a',
    theirHabitId: 'b',
    target: 3,
    requiresPhoto: false,
    startsOn: '2026-11-02',
    pendingFor: null,
    ...o,
  })
  const dates = (h: string) => ({ a: ['2026-11-09', '2026-11-10', '2026-11-03'], b: ['2026-11-11'] })[h] ?? []

  it('counts each side inside the running period against the item target', () => {
    expect(itemProgress(view(), 'weekly', period, dates)).toEqual({ type: 'weekly', target: 3, you: 2, them: 1 })
  })

  it('daily items are a done / not done pair', () => {
    expect(itemProgress(view({ target: null }), 'daily', { start: '2026-11-10', end: '2026-11-10' }, dates)).toEqual({
      type: 'daily',
      youDone: true,
      themDone: false,
    })
  })

  it('is null for an item that has not started in this period or is not active', () => {
    expect(itemProgress(view({ startsOn: '2026-11-16' }), 'weekly', period, dates)).toBeNull()
    expect(itemProgress(view({ status: 'proposed', startsOn: null }), 'weekly', period, dates)).toBeNull()
  })
})

describe('subRetosLabel', () => {
  it('shows nothing for one item and "+N" for the rest', () => {
    expect(subRetosLabel(1)).toBeNull()
    expect(subRetosLabel(2)).toBe('+1 sub-reto')
    expect(subRetosLabel(4)).toBe('+3 sub-retos')
  })
})

describe('failureHistory with sub-reto results', () => {
  const ME = 'me'
  const THEM = 'them'
  const weekly = { type: 'weekly' as const, target: 3 }
  const periods = periodsFor('2026-11-02', 4, weekly)
  const debt = (period_start: string, debtor_id: string) => ({ period_start, debtor_id, amount: 2500, paid_at: null })
  const names = new Map([
    ['i1', { mine: 'Agua', theirs: 'Beber' }],
    ['i2', { mine: 'Gym', theirs: 'Pesas' }],
  ])
  const base = {
    periods,
    closedStarts: ['2026-11-02'],
    otherName: 'Ana',
    frequency: weekly,
    myId: ME,
    myDates: [],
    theirDates: null,
    itemNames: names,
  }

  it('names the sub-retos I failed', () => {
    const rows = failureHistory({
      ...base,
      debts: [debt('2026-11-02', ME)],
      itemResults: [
        { period_start: '2026-11-02', item_id: 'i1', player_id: ME, met: false },
        { period_start: '2026-11-02', item_id: 'i2', player_id: ME, met: false },
        { period_start: '2026-11-02', item_id: 'i1', player_id: THEM, met: true },
      ],
    })
    expect(rows[0].summary).toBe('No cumpliste: Agua, Gym')
    expect(rows[0].debt).toEqual({ amount: 2500, paid: false })
  })

  it('names the sub-retos the rival failed, with their habit names', () => {
    const rows = failureHistory({
      ...base,
      debts: [debt('2026-11-02', THEM)],
      itemResults: [
        { period_start: '2026-11-02', item_id: 'i2', player_id: THEM, met: false },
        { period_start: '2026-11-02', item_id: 'i2', player_id: ME, met: true },
      ],
    })
    expect(rows[0].summary).toBe('Ana no cumplió: Pesas')
  })

  it('falls back to the legacy text for periods without result rows', () => {
    const rows = failureHistory({
      ...base,
      debts: [debt('2026-11-02', ME)],
      itemResults: [{ period_start: '2026-11-09', item_id: 'i1', player_id: ME, met: false }],
    })
    expect(rows[0].summary).toBe('Hiciste 0 de 3')
  })

  it('keeps the compensation text when both failed', () => {
    const rows = failureHistory({
      ...base,
      debts: [debt('2026-11-02', ME), debt('2026-11-02', THEM)],
      itemResults: [{ period_start: '2026-11-02', item_id: 'i1', player_id: ME, met: false }],
    })
    expect(rows[0].summary).toBe('Fallaron los dos · se compensa')
  })

  it('works unchanged when no itemResults are given', () => {
    const rows = failureHistory({ ...base, itemNames: undefined, debts: [debt('2026-11-02', ME)] })
    expect(rows[0].summary).toBe('Hiciste 0 de 3')
  })
})
