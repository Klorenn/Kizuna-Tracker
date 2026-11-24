import { describe, expect, it } from 'vitest'
import { weeklySummary, type SummaryDebt, type SummaryHabit } from '@/domain/weekly-summary'

const TZ = 'America/Santiago'
const SUNDAY = '2026-11-22' // week Mon 2026-11-16 .. Sun 2026-11-22
const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
const OLD = '2026-01-01T12:00:00Z'

const habit = (over: Partial<SummaryHabit> = {}): SummaryHabit => ({
  id: 'h1',
  name: 'Gym',
  visibility: 'friends',
  archivedAt: null,
  createdAt: OLD,
  frequency: { type: 'daily' },
  dates: [],
  ...over,
})
const debt = (over: Partial<SummaryDebt> = {}): SummaryDebt => ({
  challengeId: 'c1',
  periodStart: '2026-11-09',
  debtorId: 'me',
  creditorId: 'f1',
  amount: 1000,
  paidAt: null,
  createdAt: '2026-11-17T12:00:00Z',
  ...over,
})
const run = (habits: SummaryHabit[], debts: SummaryDebt[] = []) =>
  weeklySummary({ habits, debts, me: 'me', today: SUNDAY, timeZone: TZ })

describe('weeklySummary', () => {
  it('counts completed vs due for a daily habit', () => {
    const r = run([habit({ dates: WEEK.slice(0, 5) })])
    expect(r).toMatchObject({ done: 5, due: 7 })
  })
  it('ignores check-ins outside the ISO week and duplicates', () => {
    const r = run([habit({ dates: ['2026-11-15', '2026-11-16', '2026-11-16', '2026-11-23'] })])
    expect(r).toMatchObject({ done: 1, due: 7 })
  })
  it('a habit created mid-week is due only since its creation day (local)', () => {
    // 2026-11-20T02:00Z is 2026-11-19 23:00 in Santiago: Thu..Sun = 4 days
    const r = run([habit({ createdAt: '2026-11-20T02:00:00Z', dates: ['2026-11-19'] })])
    expect(r).toMatchObject({ done: 1, due: 4 })
  })
  it('a weekly habit is due target times, done capped at target', () => {
    const r = run([habit({ frequency: { type: 'weekly', target: 3 }, dates: WEEK.slice(0, 5) })])
    expect(r).toMatchObject({ done: 3, due: 3 })
  })
  it('a weekly habit created late cannot be due more than the days it had', () => {
    const r = run([habit({ frequency: { type: 'weekly', target: 5 }, createdAt: '2026-11-21T15:00:00Z', dates: [] })])
    expect(r).toMatchObject({ done: 0, due: 2 })
  })
  it('sums several habits and skips archived ones', () => {
    const r = run([
      habit({ id: 'a', dates: WEEK }),
      habit({ id: 'b', name: 'Leer', dates: WEEK.slice(0, 3) }),
      habit({ id: 'c', name: 'Old', archivedAt: '2026-11-01T00:00:00Z', dates: WEEK }),
    ])
    expect(r).toMatchObject({ done: 10, due: 14 })
  })
  it('returns null when there is nothing due (no habits)', () => {
    expect(run([])).toBeNull()
    expect(run([habit({ archivedAt: '2026-11-01T00:00:00Z' })])).toBeNull()
  })
  it('best current streak is the longest daily streak and names the habit', () => {
    const long = ['2026-11-22', ...Array.from({ length: 11 }, (_, i) => `2026-11-${String(21 - i).padStart(2, '0')}`)]
    const r = run([habit({ id: 'a', name: 'Leer', dates: WEEK.slice(4) }), habit({ id: 'b', name: 'Gym', dates: long })])
    expect(r).toMatchObject({ bestStreak: 12, bestHabit: 'Gym' })
  })
  it('best streak ignores private, archived and weekly habits', () => {
    const r = run([
      habit({ id: 'a', visibility: 'private', dates: WEEK }),
      habit({ id: 'b', frequency: { type: 'weekly', target: 2 }, dates: WEEK }),
      habit({ id: 'c', name: 'Leer', dates: WEEK.slice(5) }),
    ])
    expect(r).toMatchObject({ bestStreak: 2, bestHabit: 'Leer' })
  })
  it('no streak: zero and no habit name', () => {
    expect(run([habit({ dates: [] })])).toMatchObject({ bestStreak: 0, bestHabit: null })
  })
  it('counts challenge weeks won (only the rival owes) and lost (only I owe) settled this local week', () => {
    const r = run([habit()], [
      debt({ challengeId: 'a', debtorId: 'me', creditorId: 'f1' }),
      debt({ challengeId: 'b', debtorId: 'f2', creditorId: 'me', createdAt: '2026-11-18T12:00:00Z', paidAt: '2026-11-19T00:00:00Z' }),
      debt({ challengeId: 'c', debtorId: 'f3', creditorId: 'me', createdAt: '2026-11-19T12:00:00Z' }),
      debt({ challengeId: 'd', debtorId: 'me', creditorId: 'f1', createdAt: '2026-11-10T12:00:00Z' }), // last week
    ])
    expect(r).toMatchObject({ won: 2, lost: 1 })
  })
  it('a week where both players failed (two debts for one challenge period) counts as neither won nor lost', () => {
    const r = run([habit()], [
      debt({ challengeId: 'x', periodStart: '2026-11-09', debtorId: 'me', creditorId: 'f1' }),
      debt({ challengeId: 'x', periodStart: '2026-11-09', debtorId: 'f1', creditorId: 'me' }),
    ])
    expect(r).toMatchObject({ won: 0, lost: 0 })
  })
  it('two periods of the same challenge are two weeks', () => {
    const r = run([habit()], [
      debt({ challengeId: 'x', periodStart: '2026-11-02', debtorId: 'me', creditorId: 'f1' }),
      debt({ challengeId: 'x', periodStart: '2026-11-09', debtorId: 'me', creditorId: 'f1' }),
    ])
    expect(r).toMatchObject({ lost: 2 })
  })
  it('the mutual-failure pair still weighs on the balance when unpaid (net of both)', () => {
    const r = run([habit()], [
      debt({ challengeId: 'x', debtorId: 'me', creditorId: 'f1', amount: 3000 }),
      debt({ challengeId: 'x', debtorId: 'f1', creditorId: 'me', amount: 1000 }),
    ])
    expect(r).toMatchObject({ balance: -2000 })
  })
  it('week boundaries use the user zone: Mon 00:00 local is in, Sun 23:59 local is in', () => {
    const r = run([habit()], [
      debt({ challengeId: 'a', createdAt: '2026-11-16T03:00:00Z' }), // Mon 00:00 Santiago (UTC-3)
      debt({ challengeId: 'b', createdAt: '2026-11-16T02:59:00Z' }), // Sun 23:59 previous week
      debt({ challengeId: 'c', createdAt: '2026-11-23T02:59:00Z' }), // Sun 23:59 this week
      debt({ challengeId: 'd', createdAt: '2026-11-23T03:00:00Z' }), // next Monday 00:00
    ])
    expect(r).toMatchObject({ lost: 2, won: 0 })
  })
  it('net balance sums unpaid debts: negative when I owe, positive when I am owed', () => {
    expect(run([habit()], [debt({ amount: 3000 }), debt({ amount: 1000, debtorId: 'f1', creditorId: 'me', createdAt: '2026-10-01T00:00:00Z' })])).toMatchObject({ balance: -2000 })
    expect(run([habit()], [debt({ debtorId: 'f1', creditorId: 'me', amount: 500 })])).toMatchObject({ balance: 500 })
  })
  it('paid debts do not weigh on the balance and a zero balance stays zero', () => {
    expect(run([habit()], [debt({ paidAt: '2026-11-18T00:00:00Z' })])).toMatchObject({ balance: 0, lost: 1 })
    expect(run([habit()], [])).toMatchObject({ balance: 0, won: 0, lost: 0 })
  })
  it('ignores debts that do not involve me', () => {
    expect(run([habit()], [debt({ debtorId: 'x', creditorId: 'y' })])).toMatchObject({ balance: 0, won: 0, lost: 0 })
  })
})
