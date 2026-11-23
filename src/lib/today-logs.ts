import type { SupabaseClient } from '@supabase/supabase-js'
import { DAY_TYPES, type DayType, type TodayLog } from '@/domain/logs'
import type { LocalDate } from '@/domain/types'
import type { Database } from '@/lib/supabase/database.types'

type ReadingRow = {
  habit_id: string
  checkin_id: string
  book_id: string
  from_page: number
  to_page: number
  books: { title: string } | null
}
type SessionRow = { id: string; habit_id: string; day_types: string[] }
type SetRow = { session_id: string; exercise_id: string }

export type TodayReading = { checkinId: string; entry: { bookId: string; fromPage: number; toPage: number } }

/** Hoy's logs by habit ("26 páginas · Dune", "Pierna · 5 ejercicios") and today's readings for editing. */
export function todayLogs(
  readings: ReadingRow[],
  sessions: SessionRow[],
  sets: SetRow[],
): { logs: Record<string, TodayLog>; readings: Record<string, TodayReading> } {
  const logs: Record<string, TodayLog> = {}
  const byHabit: Record<string, TodayReading> = {}
  for (const r of readings) {
    logs[r.habit_id] = { kind: 'reading', pages: r.to_page - r.from_page, bookTitle: r.books?.title ?? 'Libro' }
    byHabit[r.habit_id] = {
      checkinId: r.checkin_id,
      entry: { bookId: r.book_id, fromPage: r.from_page, toPage: r.to_page },
    }
  }
  const exercises = new Map<string, Set<string>>()
  for (const s of sets) {
    const set = exercises.get(s.session_id) ?? new Set<string>()
    set.add(s.exercise_id)
    exercises.set(s.session_id, set)
  }
  for (const s of sessions) {
    const dayTypes = s.day_types.filter((t): t is DayType => (DAY_TYPES as readonly string[]).includes(t))
    logs[s.habit_id] = { kind: 'workout', dayTypes, exerciseCount: exercises.get(s.id)?.size ?? 0 }
  }
  return { logs, readings: byHabit }
}

/** Today's reading entries, workout sessions and their sets (all bounded to one local date). */
export async function loadTodayLogs(supabase: SupabaseClient<Database>, userId: string, today: LocalDate) {
  const [readings, sessions, sets] = await Promise.all([
    supabase
      .from('reading_entries')
      .select('habit_id,checkin_id,book_id,from_page,to_page,books(title)')
      .eq('user_id', userId)
      .eq('local_date', today),
    supabase.from('workout_sessions').select('id,habit_id,day_types').eq('user_id', userId).eq('local_date', today),
    supabase.from('workout_sets').select('session_id,exercise_id').eq('user_id', userId).eq('local_date', today),
  ])
  return todayLogs(readings.data ?? [], sessions.data ?? [], sets.data ?? [])
}
