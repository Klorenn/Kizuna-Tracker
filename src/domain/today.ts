import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { addDays, weekStart } from './dates'
import { toHabitColor, type HabitColor } from './habit-colors'
import { LOG_TYPES, logSubtitle, type LogType, type TodayLog } from './logs'
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
  preset?: string | null
  log_type?: string | null
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
  preset: string | null
  frequency: Frequency
  done: boolean
  streak: number
  weekCount: number
  items: TodayItem[]
  logType: LogType
  /** today's log of this habit (reading or workout), if any */
  log: TodayLog | null
}

export function buildToday(input: {
  habits: HabitInput[]
  items: ItemInput[]
  checkins: CheckinInput[]
  itemChecks: ItemCheckInput[]
  /** today's logs by habit_id (several when the log type changed after logging) */
  logs?: Record<string, TodayLog | TodayLog[]>
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
      preset: h.preset ?? null,
      frequency,
      done: dates.includes(today),
      streak,
      weekCount,
      items,
      logType: toLogType(h.log_type),
      log: pickLog(input.logs?.[h.id], toLogType(h.log_type)),
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

/** The log whose kind matches the habit's log type, else whichever exists (first). */
function pickLog(logs: TodayLog | TodayLog[] | undefined, logType: LogType): TodayLog | null {
  const list = logs === undefined ? [] : Array.isArray(logs) ? logs : [logs]
  return list.find((l) => l.kind === logType) ?? list[0] ?? null
}

const UNDO_LOSES: Record<TodayLog['kind'], string> = {
  reading: 'Se borrará también la lectura de hoy.',
  workout: 'Se borrará también el entrenamiento de hoy.',
}

/**
 * Undoing a check-in deletes its log (cascade). Ask whenever a log exists, whatever the habit's
 * current log type, and name the log that is actually there. Null: undo right away.
 */
export function undoLosesCopy(row: Pick<TodayRow, 'log'>): string | null {
  return row.log ? UNDO_LOSES[row.log.kind] : null
}

const toLogType = (v: string | null | undefined): LogType =>
  (LOG_TYPES as readonly string[]).includes(v ?? '') ? (v as LogType) : 'none'

export function habitSubtitle(row: TodayRow): string {
  if (row.log) return logSubtitle(row.log)
  if (row.frequency.type === 'weekly') {
    return `${row.weekCount} de ${row.frequency.target} esta semana`
  }
  return row.items.length > 0 ? `Diario · ${row.items.length} pasos` : 'Diario'
}
