import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardioKind } from '@/domain/cardio'
import { DAY_TYPES, pagesRead, type DayType, type TodayLog } from '@/domain/logs'
import type { MediaKind } from '@/domain/watch'
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

type TimeRow = { habit_id: string; minutes: number; topic: string | null }
type WatchRow = {
  habit_id: string
  episodes: number | null
  minutes: number | null
  completed: boolean
  media_items: { title: string; kind: string } | null
}
type CardioRow = { habit_id: string; kind: string; distance_m: number; duration_s: number }
type QuantityRow = { id: string; habit_id: string; amount: number; created_at: string }
export type ExtraRows = { time?: TimeRow[]; watch?: WatchRow[]; cardio?: CardioRow[]; quantity?: QuantityRow[] }
export type TodayQuantityEntry = { id: string; amount: number; at: string }
const CARDIO_KINDS: readonly string[] = ['run', 'walk', 'bike', 'swim', 'other']

export type TodayReading = { checkinId: string; entry: { bookId: string; fromPage: number; toPage: number } }

/**
 * Hoy's logs by habit ("26 páginas · Dune", "Pierna · 5 ejercicios") and today's readings for
 * editing. A habit can hold BOTH kinds when its log type changed after logging, so every log is
 * kept (reading first) and buildToday picks the one matching the habit's log type.
 */
export function todayLogs(
  readings: ReadingRow[],
  sessions: SessionRow[],
  sets: SetRow[],
  extra: ExtraRows = {},
): {
  logs: Record<string, TodayLog[]>
  readings: Record<string, TodayReading>
  /** today's quantity sums by habit, oldest first */
  quantity: Record<string, TodayQuantityEntry[]>
} {
  const logs: Record<string, TodayLog[]> = {}
  const add = (habitId: string, log: TodayLog) => (logs[habitId] ??= []).push(log)
  const byHabit: Record<string, TodayReading> = {}
  for (const r of readings) {
    add(r.habit_id, {
      kind: 'reading',
      pages: pagesRead({ fromPage: r.from_page, toPage: r.to_page }),
      bookTitle: r.books?.title ?? 'Libro',
    })
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
    add(s.habit_id, { kind: 'workout', dayTypes, exerciseCount: exercises.get(s.id)?.size ?? 0 })
  }
  for (const t of extra.time ?? []) add(t.habit_id, { kind: 'time', minutes: t.minutes, topic: t.topic })
  for (const w of extra.watch ?? []) {
    add(w.habit_id, {
      kind: 'watch',
      title: w.media_items?.title ?? 'Título',
      mediaKind: (w.media_items?.kind === 'movie' ? 'movie' : 'series') satisfies MediaKind,
      episodes: w.episodes,
      minutes: w.minutes,
      completed: w.completed,
    })
  }
  const outings: Record<string, { distanceM: number; durationS: number; kind: CardioKind }[]> = {}
  for (const c of extra.cardio ?? []) {
    const kind: CardioKind = CARDIO_KINDS.includes(c.kind) ? (c.kind as CardioKind) : 'other'
    ;(outings[c.habit_id] ??= []).push({ distanceM: c.distance_m, durationS: c.duration_s, kind })
  }
  for (const [habitId, entries] of Object.entries(outings)) add(habitId, { kind: 'cardio', entries })
  const quantity: Record<string, TodayQuantityEntry[]> = {}
  const byTime = [...(extra.quantity ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const q of byTime) (quantity[q.habit_id] ??= []).push({ id: q.id, amount: Number(q.amount), at: q.created_at })
  return { logs, readings: byHabit, quantity }
}

/** Today's logs of every kind, in one round of parallel reads (each bounded to one local date). */
export async function loadTodayLogs(supabase: SupabaseClient<Database>, userId: string, today: LocalDate) {
  const [readings, sessions, sets, time, watch, cardio, quantity] = await Promise.all([
    supabase
      .from('reading_entries')
      .select('habit_id,checkin_id,book_id,from_page,to_page,books(title)')
      .eq('user_id', userId)
      .eq('local_date', today),
    supabase.from('workout_sessions').select('id,habit_id,day_types').eq('user_id', userId).eq('local_date', today),
    supabase.from('workout_sets').select('session_id,exercise_id').eq('user_id', userId).eq('local_date', today),
    supabase.from('time_entries').select('habit_id,minutes,topic').eq('user_id', userId).eq('local_date', today),
    supabase
      .from('watch_entries')
      .select('habit_id,episodes,minutes,completed,media_items(title,kind)')
      .eq('user_id', userId)
      .eq('local_date', today),
    supabase
      .from('cardio_entries')
      .select('habit_id,kind,distance_m,duration_s')
      .eq('user_id', userId)
      .eq('local_date', today)
      .order('created_at'),
    supabase.from('quantity_entries').select('id,habit_id,amount,created_at').eq('user_id', userId).eq('local_date', today),
  ])
  return todayLogs(readings.data ?? [], sessions.data ?? [], sets.data ?? [], {
    time: time.data ?? [],
    watch: watch.data ?? [],
    cardio: cardio.data ?? [],
    quantity: quantity.data ?? [],
  })
}
