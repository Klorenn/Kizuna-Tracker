import { describe, expect, it } from 'vitest'
import { dueReminders } from '@/lib/reminders'

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  timezone: 'America/Santiago',
  reminderTime: '20:00',
  pendingToday: true,
  ...over,
})

// Santiago is UTC-3 in November (DST), so 20:07 local = 23:07Z.
const at = (hhmmZ: string) => new Date(`2026-11-22T${hhmmZ}:00Z`)

describe('dueReminders', () => {
  it('includes a user whose reminder time passed within the window (20:07 local)', () => {
    expect(dueReminders([user()], at('23:07'))).toEqual(['u1'])
  })
  it('includes exactly at the reminder time', () => {
    expect(dueReminders([user()], at('23:00'))).toEqual(['u1'])
  })
  it('excludes after the window (20:16 local)', () => {
    expect(dueReminders([user()], at('23:16'))).toEqual([])
  })
  it('excludes before the reminder time', () => {
    expect(dueReminders([user()], at('22:59'))).toEqual([])
  })
  it('excludes users with nothing pending', () => {
    expect(dueReminders([user({ pendingToday: false })], at('23:07'))).toEqual([])
  })
  it('accepts HH:MM:SS times as stored by postgres', () => {
    expect(dueReminders([user({ reminderTime: '20:00:00' })], at('23:07'))).toEqual(['u1'])
  })
  it('respects each timezone', () => {
    const tokyo = user({ id: 'u2', timezone: 'Asia/Tokyo' }) // 20:07 JST = 11:07Z
    expect(dueReminders([user(), tokyo], at('11:07'))).toEqual(['u2'])
  })
})
