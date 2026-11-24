import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import type { LocalDate } from './types'

/** A recurring local moment: minute of the local day and, optionally, the ISO weekday (1 = Monday .. 7 = Sunday). */
export type LocalSlot = { minuteOfDay: number; isoWeekday?: number }

/** Streak-at-risk push: every evening at 20:00 local. */
export const STREAK_RISK_SLOT: LocalSlot = { minuteOfDay: 20 * 60 }
/** Weekly summary push: Sunday 21:00 local, after the streak-at-risk one. */
export const WEEKLY_SUMMARY_SLOT: LocalSlot = { minuteOfDay: 21 * 60, isoWeekday: 7 }

/**
 * The local date of the slot when `now` falls in the `windowMinutes` that follow it in `timeZone`,
 * else null. The cron ticks every 15 minutes, so each slot is hit by exactly one tick. Modular
 * arithmetic on the local clock keeps a DST change from shifting the slot: it is always "20:00 on
 * the user's wall clock". An invalid zone never matches (an Invalid Date compares false, so it is
 * rejected explicitly).
 */
export function dueLocalSlot(now: Date, timeZone: string, slot: LocalSlot, windowMinutes = 15): LocalDate | null {
  if (!timeZone) return null
  const local = new TZDate(now, timeZone)
  if (Number.isNaN(local.getTime())) return null
  const elapsed = (((local.getHours() * 60 + local.getMinutes() - slot.minuteOfDay) % 1440) + 1440) % 1440
  if (elapsed >= windowMinutes) return null
  const slotStart = new TZDate(now.getTime() - elapsed * 60_000, timeZone)
  if (slot.isoWeekday !== undefined && ((slotStart.getDay() + 6) % 7) + 1 !== slot.isoWeekday) return null
  return format(slotStart, 'yyyy-MM-dd')
}

/** Users whose slot is open right now, each with the local date it belongs to (the once-per-day key). */
export function dueUsersForSlot<T extends { id: string; timezone: string }>(
  users: T[],
  now: Date,
  slot: LocalSlot,
  windowMinutes = 15,
): (T & { localDate: LocalDate })[] {
  const out: (T & { localDate: LocalDate })[] = []
  for (const u of users) {
    const localDate = dueLocalSlot(now, u.timezone, slot, windowMinutes)
    if (localDate) out.push({ ...u, localDate })
  }
  return out
}
