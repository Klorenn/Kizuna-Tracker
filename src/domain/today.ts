import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { addDays, weekStart } from './dates'
import { toHabitColor, type HabitColor } from './habit-colors'
import type { IconKey, Visibility } from './presets'
import { dailyStreak, weeklyStreak } from './streaks'
import type { Frequency, LocalDate } from './types'

export type HabitInput = {
  id: string
  name: string
  icon: string
  visibility: string
  requires_photo: boolean
  frequency_type: string
  target_per_week: number | null
  color?: string | null
}
export type ItemInput = {
  id: string
  habit_id: string
  label: string
  position: number
  requires_photo: boolean
}
export type CheckinInput = { habit_id: string; local_date: LocalDate }
export type ItemCheckInput = { item_id: string; local_date: LocalDate; created_at: string }

export type TodayItem = {
  id: string
  label: string
  requiresPhoto: boolean
  checked: boolean
  time: string | null
}
export type TodayRow = {
  id: string
  name: string
  icon: IconKey
  color: HabitColor
  visibility: Visibility
  requiresPhoto: boolean
  frequency: Frequency
  done: boolean
  streak: number
  weekCount: number
  items: TodayItem[]
}

export function buildToday(input: {
  habits: HabitInput[]
  items: ItemInput[]
  checkins: CheckinInput[]
  itemChecks: ItemCheckInput[]
  today: LocalDate
  timeZone: string
}): { rows: TodayRow[]; doneCount: number; total: number; bestDailyStreak: number } {
  const { today, timeZone } = input
  const monday = weekStart(today)
  const sunday = addDays(monday, 6)
  const checkedToday = new Map(
    input.itemChecks.filter((c) => c.local_date === today).map((c) => [c.item_id, c.created_at]),
  )

  const rows: TodayRow[] = input.habits.map((h) => {
    const frequency: Frequency =
      h.frequency_type === 'weekly'
        ? { type: 'weekly', target: h.target_per_week ?? 1 }
        : { type: 'daily' }
    const dates = input.checkins.filter((c) => c.habit_id === h.id).map((c) => c.local_date)
    const streak =
      frequency.type === 'daily'
        ? dailyStreak(dates, today)
        : weeklyStreak(dates, frequency.target, today)
    const weekCount = new Set(dates.filter((d) => d >= monday && d <= sunday)).size
    const items = input.items
      .filter((i) => i.habit_id === h.id)
      .sort((a, b) => a.position - b.position)
      .map((i) => {
        const at = checkedToday.get(i.id)
        return {
          id: i.id,
          label: i.label,
          requiresPhoto: i.requires_photo,
          checked: at !== undefined,
          time: at ? format(new TZDate(new Date(at), timeZone), 'H:mm') : null,
        }
      })
    return {
      id: h.id,
      name: h.name,
      icon: h.icon as IconKey,
      color: toHabitColor(h.color),
      visibility: h.visibility as Visibility,
      requiresPhoto: h.requires_photo,
      frequency,
      done: dates.includes(today),
      streak,
      weekCount,
      items,
    }
  })

  const dailyStreaks = rows.filter((r) => r.frequency.type === 'daily').map((r) => r.streak)
  return {
    rows,
    doneCount: rows.filter((r) => r.done).length,
    total: rows.length,
    bestDailyStreak: dailyStreaks.length ? Math.max(...dailyStreaks) : 0,
  }
}

export function habitSubtitle(row: TodayRow): string {
  if (row.frequency.type === 'weekly') {
    return `${row.weekCount} de ${row.frequency.target} esta semana`
  }
  return row.items.length > 0 ? `Diario · ${row.items.length} pasos` : 'Diario'
}
