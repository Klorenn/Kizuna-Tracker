export type NotifyPref = 'streak_risk' | 'weekly_summary'

/** A kind from the client is never trusted into a column name. */
export function parseNotifyPref(v: unknown): NotifyPref | null {
  return v === 'streak_risk' || v === 'weekly_summary' ? v : null
}

export type NotifyPrefs = { streakRisk: boolean; weeklySummary: boolean }
