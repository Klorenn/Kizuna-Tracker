import { describe, expect, it } from 'vitest'
import { MIN_RISK_STREAK, streakAtRisk, type RiskHabit } from '@/domain/streak-risk'

const TODAY = '2026-11-22'
const run = (n: number, from = '2026-11-21') => {
  // n consecutive days ending at `from`
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return out
}
const habit = (over: Partial<RiskHabit> = {}): RiskHabit => ({
  id: 'h1',
  name: 'Gym',
  visibility: 'friends',
  archivedAt: null,
  frequency: { type: 'daily' },
  dates: run(5),
  ...over,
})

describe('streakAtRisk', () => {
  it('threshold is 3 days', () => expect(MIN_RISK_STREAK).toBe(3))
  it('flags a daily habit with streak >= 3 not done today', () => {
    expect(streakAtRisk([habit()], TODAY)).toEqual({ habitName: 'Gym', streak: 5, more: 0 })
  })
  it('streak of exactly 3 counts, 2 does not', () => {
    expect(streakAtRisk([habit({ dates: run(3) })], TODAY)?.streak).toBe(3)
    expect(streakAtRisk([habit({ dates: run(2) })], TODAY)).toBeNull()
  })
  it('a habit already done today is safe', () => {
    expect(streakAtRisk([habit({ dates: [TODAY, ...run(5)] })], TODAY)).toBeNull()
  })
  it('a streak that already broke (no check-in yesterday) is not at risk', () => {
    expect(streakAtRisk([habit({ dates: run(5, '2026-11-20') })], TODAY)).toBeNull()
  })
  it('skips archived and private habits', () => {
    expect(streakAtRisk([habit({ archivedAt: '2026-11-01T00:00:00Z' })], TODAY)).toBeNull()
    expect(streakAtRisk([habit({ visibility: 'private' })], TODAY)).toBeNull()
  })
  it('skips weekly habits (their streak counts weeks, the copy says days)', () => {
    expect(streakAtRisk([habit({ frequency: { type: 'weekly', target: 3 } })], TODAY)).toBeNull()
  })
  it('picks the biggest streak and counts the others in "more"', () => {
    const r = streakAtRisk(
      [habit({ id: 'a', name: 'Leer', dates: run(4) }), habit({ id: 'b', name: 'Gym', dates: run(12) }), habit({ id: 'c', name: 'Agua', dates: run(3) })],
      TODAY,
    )
    expect(r).toEqual({ habitName: 'Gym', streak: 12, more: 2 })
  })
  it('ties break by name then id, deterministically', () => {
    const a = habit({ id: 'b', name: 'Zeta', dates: run(4) })
    const b = habit({ id: 'a', name: 'Alfa', dates: run(4) })
    expect(streakAtRisk([a, b], TODAY)?.habitName).toBe('Alfa')
    expect(streakAtRisk([b, a], TODAY)?.habitName).toBe('Alfa')
  })
  it('ignores a safe or ineligible habit when counting "more"', () => {
    const r = streakAtRisk(
      [habit({ id: 'a', dates: run(6) }), habit({ id: 'b', name: 'X', dates: [TODAY, ...run(9)] }), habit({ id: 'c', name: 'Y', visibility: 'private', dates: run(9) })],
      TODAY,
    )
    expect(r).toEqual({ habitName: 'Gym', streak: 6, more: 0 })
  })
  it('returns null with no habits', () => expect(streakAtRisk([], TODAY)).toBeNull())
})
