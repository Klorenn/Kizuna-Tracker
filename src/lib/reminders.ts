import { TZDate } from '@date-fns/tz'

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

/**
 * Users whose local reminder time falls in [now - windowMinutes, now] and who still have
 * something to do today. The cron runs every 15 minutes, so each user lands in exactly one run.
 */
export function dueReminders(users: ReminderCandidate[], now: Date, windowMinutes = 15): string[] {
  return users
    .filter((u) => {
      if (!u.pendingToday) return false
      const local = new TZDate(now, u.timezone)
      const elapsed = local.getHours() * 60 + local.getMinutes() - minutesOfDay(u.reminderTime)
      return elapsed >= 0 && elapsed < windowMinutes
    })
    .map((u) => u.id)
}
