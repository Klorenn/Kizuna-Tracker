import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

export type ReminderCandidate = {
  id: string
  timezone: string
  /** `HH:MM` or `HH:MM:SS`, as stored in profiles.reminder_time. */
  reminderTime: string
  pendingToday: boolean
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export type DueReminder = { id: string; localDate: string }

/**
 * Users whose local reminder time falls in the last `windowMinutes` (modular, so a 23:55 reminder
 * still fires at 00:05) and who still have something to do. `localDate` is the local day the
 * reminder belongs to, used as the once-per-day marker.
 */
export function dueReminderEntries(users: ReminderCandidate[], now: Date, windowMinutes = 15): DueReminder[] {
  const out: DueReminder[] = []
  for (const u of users) {
    if (!u.pendingToday) continue
    const local = new TZDate(now, u.timezone)
    const elapsed = (((local.getHours() * 60 + local.getMinutes() - minutesOfDay(u.reminderTime)) % 1440) + 1440) % 1440
    if (elapsed >= windowMinutes) continue
    out.push({ id: u.id, localDate: format(new TZDate(now.getTime() - elapsed * 60_000, u.timezone), 'yyyy-MM-dd') })
  }
  return out
}

export function dueReminders(users: ReminderCandidate[], now: Date, windowMinutes = 15): string[] {
  return dueReminderEntries(users, now, windowMinutes).map((d) => d.id)
}
