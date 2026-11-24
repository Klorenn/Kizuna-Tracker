import { describe, expect, it } from 'vitest'
import { dueLocalSlot, dueUsersForSlot, STREAK_RISK_SLOT, WEEKLY_SUMMARY_SLOT } from '@/domain/local-window'

const z = (iso: string) => new Date(iso)

describe('dueLocalSlot (20:00 local, 15 minute tick window)', () => {
  it('hits exactly at 20:00 and returns the local date', () => {
    // Santiago is UTC-3 in November
    expect(dueLocalSlot(z('2026-11-22T23:00:00Z'), 'America/Santiago', STREAK_RISK_SLOT)).toBe('2026-11-22')
  })
  it('hits at 20:14, not at 20:15 and not at 19:59', () => {
    expect(dueLocalSlot(z('2026-11-22T23:14:59Z'), 'America/Santiago', STREAK_RISK_SLOT)).toBe('2026-11-22')
    expect(dueLocalSlot(z('2026-11-22T23:15:00Z'), 'America/Santiago', STREAK_RISK_SLOT)).toBeNull()
    expect(dueLocalSlot(z('2026-11-22T22:59:59Z'), 'America/Santiago', STREAK_RISK_SLOT)).toBeNull()
  })
  it('each 15 minute tick hits exactly one window: no user is skipped or doubled', () => {
    const hits: number[] = []
    for (let m = 0; m < 24 * 60; m += 15) {
      const now = new Date(Date.UTC(2026, 10, 22, 0, 0) + m * 60_000)
      if (dueLocalSlot(now, 'Asia/Kolkata', STREAK_RISK_SLOT)) hits.push(m)
    }
    expect(hits).toHaveLength(1) // India is UTC+5:30: 20:00 local = 14:30Z
    expect(hits[0]).toBe(14 * 60 + 30)
  })
  it('different zones hit at different instants', () => {
    const now = z('2026-11-22T23:00:00Z')
    expect(dueLocalSlot(now, 'America/Santiago', STREAK_RISK_SLOT)).toBe('2026-11-22')
    expect(dueLocalSlot(now, 'Europe/Madrid', STREAK_RISK_SLOT)).toBeNull() // 00:00 next day
    expect(dueLocalSlot(z('2026-11-22T19:00:00Z'), 'Europe/Madrid', STREAK_RISK_SLOT)).toBe('2026-11-22')
    expect(dueLocalSlot(z('2026-11-22T11:00:00Z'), 'Asia/Tokyo', STREAK_RISK_SLOT)).toBe('2026-11-22')
  })
  it('uses the local date, which can differ from the UTC date', () => {
    // Auckland (UTC+13) is already on Nov 23 at 07:00Z; Los Angeles (UTC-8) is still on Nov 22 at 04:00Z
    expect(dueLocalSlot(z('2026-11-23T07:00:00Z'), 'Pacific/Auckland', STREAK_RISK_SLOT)).toBe('2026-11-23')
    expect(dueLocalSlot(z('2026-11-23T04:00:00Z'), 'America/Los_Angeles', STREAK_RISK_SLOT)).toBe('2026-11-22')
  })
  it('DST spring forward (New York, 2026-03-08): 20:00 is EDT (UTC-4)', () => {
    expect(dueLocalSlot(z('2026-03-09T00:00:00Z'), 'America/New_York', STREAK_RISK_SLOT)).toBe('2026-03-08')
    expect(dueLocalSlot(z('2026-03-09T01:00:00Z'), 'America/New_York', STREAK_RISK_SLOT)).toBeNull() // that would be 21:00
  })
  it('DST fall back (New York, 2026-11-01): 20:00 is EST (UTC-5)', () => {
    expect(dueLocalSlot(z('2026-11-02T01:00:00Z'), 'America/New_York', STREAK_RISK_SLOT)).toBe('2026-11-01')
    expect(dueLocalSlot(z('2026-11-02T00:00:00Z'), 'America/New_York', STREAK_RISK_SLOT)).toBeNull()
  })
  it('Santiago DST change at 24:00 does not move the evening slot', () => {
    // clocks go forward at 24:00 on Sat 2026-09-05: Saturday 20:00 is UTC-4 (00:00Z), Sunday 20:00 is UTC-3 (23:00Z)
    expect(dueLocalSlot(z('2026-09-06T00:00:00Z'), 'America/Santiago', STREAK_RISK_SLOT)).toBe('2026-09-05')
    expect(dueLocalSlot(z('2026-09-06T23:00:00Z'), 'America/Santiago', STREAK_RISK_SLOT)).toBe('2026-09-06')
    expect(dueLocalSlot(z('2026-09-05T23:00:00Z'), 'America/Santiago', STREAK_RISK_SLOT)).toBeNull() // Sat 19:00
  })
  it('an invalid timezone never fires', () => {
    expect(dueLocalSlot(z('2026-11-22T23:00:00Z'), 'Not/AZone', STREAK_RISK_SLOT)).toBeNull()
    expect(dueLocalSlot(z('2026-11-22T23:00:00Z'), '', STREAK_RISK_SLOT)).toBeNull()
  })
})

describe('weekly slot (Sunday 21:00 local)', () => {
  it('fires on Sunday evening only', () => {
    // 2026-11-22 is a Sunday; Santiago UTC-3 -> 21:00 = 00:00Z next day
    expect(dueLocalSlot(z('2026-11-23T00:00:00Z'), 'America/Santiago', WEEKLY_SUMMARY_SLOT)).toBe('2026-11-22')
    // Saturday 21:00 local
    expect(dueLocalSlot(z('2026-11-22T00:00:00Z'), 'America/Santiago', WEEKLY_SUMMARY_SLOT)).toBeNull()
    // Monday 21:00 local
    expect(dueLocalSlot(z('2026-11-24T00:00:00Z'), 'America/Santiago', WEEKLY_SUMMARY_SLOT)).toBeNull()
  })
  it('Sunday is decided in the user zone, not in UTC', () => {
    // 2026-11-23T00:00Z is already Monday in UTC but Sunday 21:00 in Santiago
    expect(dueLocalSlot(z('2026-11-23T00:00:00Z'), 'America/Santiago', WEEKLY_SUMMARY_SLOT)).toBe('2026-11-22')
    // Tokyo: Sunday 21:00 JST = 12:00Z Sunday
    expect(dueLocalSlot(z('2026-11-22T12:00:00Z'), 'Asia/Tokyo', WEEKLY_SUMMARY_SLOT)).toBe('2026-11-22')
  })
})

describe('dueUsersForSlot', () => {
  it('keeps due users with their local date and drops the rest', () => {
    const users = [
      { id: 'cl', timezone: 'America/Santiago' },
      { id: 'es', timezone: 'Europe/Madrid' },
      { id: 'bad', timezone: 'nope' },
    ]
    expect(dueUsersForSlot(users, z('2026-11-22T23:05:00Z'), STREAK_RISK_SLOT)).toEqual([
      { id: 'cl', timezone: 'America/Santiago', localDate: '2026-11-22' },
    ])
  })
})
