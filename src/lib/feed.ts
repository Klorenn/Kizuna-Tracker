import { addDays } from '@/domain/dates'
import { dailyStreak, weeklyStreak } from '@/domain/streaks'
import type { HabitColor } from '@/domain/habit-colors'
import type { Frequency, LocalDate } from '@/domain/types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * Day section label of the activity feed, relative to the viewer's today. The check-in's
 * `local_date` is the owner's local date as stored. Rendered in a section label (sentence case).
 */
export function feedDayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Hoy'
  if (date === addDays(today, -1)) return 'Ayer'
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${y}`
  // a label starts with a capital (the CSS no longer capitalises it)
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${d} ${MONTHS[m - 1]}${year}`
}

export type DayGroup<T> = { date: LocalDate; label: string; items: T[]; continued: boolean }

/**
 * Consecutive items of the same day form a group (input is already newest first). `continuesFrom`
 * is the last day of the previous page: a page that starts on that day does not repeat its label.
 */
export function groupByDay<T extends { localDate: LocalDate }>(
  items: T[],
  today: LocalDate,
  continuesFrom: LocalDate | null = null,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.date === item.localDate) {
      last.items.push(item)
      continue
    }
    groups.push({
      date: item.localDate,
      label: feedDayLabel(item.localDate, today),
      items: [item],
      continued: groups.length === 0 && continuesFrom === item.localDate,
    })
  }
  return groups
}

export type CheckinKind = { kind: 'done' } | { kind: 'photo' } | { kind: 'items'; done: number; total: number }

/** What happened, in plain words. */
export function actionCopy(habit: string, k: CheckinKind): string {
  if (k.kind === 'photo') return `Subió su foto de ${habit}`
  if (k.kind === 'items') return `${habit} · ${k.done} de ${k.total}`
  return `Completó ${habit}`
}

export const MILESTONES = [7, 14, 21, 30, 50, 100] as const
export const isMilestone = (n: number) => (MILESTONES as readonly number[]).includes(n)

/**
 * Days of history read before the oldest feed item. Past the highest milestone (100) so a 100-day
 * streak is exact; anything that reaches the start of the window is shown capped ("130+ días").
 */
export const STREAK_LOOKBACK_DAYS = 130

const daysBetween = (from: LocalDate, to: LocalDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/**
 * Streak as of the check-in's day (later check-ins ignored). Daily habits are worth a line from
 * 3 days and a milestone chip at 7, 14, 21, 30, 50 and 100; weekly ones from 2 weeks. `since` is
 * the first day of loaded history: a streak that reaches it may be longer than we can see, so it
 * is shown as "N+" and never as a milestone.
 */
export function streakContext(
  dates: LocalDate[],
  at: LocalDate,
  frequency: Frequency,
  since?: LocalDate,
): { text: string; milestone: boolean } | null {
  const upTo = dates.filter((d) => d <= at)
  if (frequency.type === 'weekly') {
    const n = weeklyStreak(upTo, frequency.target, at)
    if (n < 2) return null
    const capped = since !== undefined && n * 7 >= daysBetween(since, at) - 6
    return { text: `Racha de ${n}${capped ? '+' : ''} semanas`, milestone: false }
  }
  const n = dailyStreak(upTo, at)
  if (n < 3) return null
  const capped = since !== undefined && daysBetween(since, at) + 1 <= n
  return capped
    ? { text: `Racha de ${n}+ días`, milestone: false }
    : { text: `Racha de ${n} días`, milestone: isMilestone(n) }
}

const REVIEW_WINDOW_MS = 24 * 3_600_000

type ReviewCheckin = {
  user_id: string
  habit_id: string
  local_date: LocalDate
  created_at: string
  photo_path: string | null
  rejected_at: string | null
  rejected_by: string | null
}
type ReviewChallenge = {
  id: string
  creator_id: string
  rival_id: string
  creator_habit_id: string
  rival_habit_id: string | null
  status: string
  requires_photo: boolean
  starts_on: string | null
  weeks: number
}

export type ReviewStatus =
  | { kind: 'rejected'; byMe: boolean }
  | { kind: 'pending'; hours: number; challengeId: string }
  | null

/**
 * Status chip of a check-in for this viewer. "Se aprueba sola en N h" only when the viewer can
 * still reject the photo (mirror of reject_checkin: active photo challenge, viewer is the owner's
 * rival on that habit, inside the challenge dates, under 24 h old).
 */
export function reviewStatus(
  k: ReviewCheckin,
  me: string,
  challenges: ReviewChallenge[],
  now: Date,
): ReviewStatus {
  if (k.rejected_at) return { kind: 'rejected', byMe: k.rejected_by === me }
  if (!k.photo_path || k.user_id === me) return null
  const left = new Date(k.created_at).getTime() + REVIEW_WINDOW_MS - now.getTime()
  if (!(left > 0)) return null
  const c = challenges.find(
    (c) =>
      c.status === 'active' &&
      c.requires_photo &&
      c.starts_on !== null &&
      ((c.creator_id === me && c.rival_id === k.user_id && c.rival_habit_id === k.habit_id) ||
        (c.rival_id === me && c.creator_id === k.user_id && c.creator_habit_id === k.habit_id)) &&
      k.local_date >= c.starts_on &&
      k.local_date <= addDays(c.starts_on, c.weeks * 7 - 1),
  )
  return c ? { kind: 'pending', hours: Math.ceil(left / 3_600_000), challengeId: c.id } : null
}

/**
 * Keyset cursor of the last item shown. The feed is ordered by (local_date, created_at, id), all
 * descending, so a day's check-ins stay together even across friends in other timezones.
 */
export type FeedCursor = { day: LocalDate; at: string; id: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Cursors come back from the client: strict shapes only (they end up in a PostgREST filter). */
export function parseCursor(value: unknown): FeedCursor | null {
  if (!value || typeof value !== 'object') return null
  const { day, at, id } = value as Record<string, unknown>
  if (typeof day !== 'string' || typeof at !== 'string' || typeof id !== 'string') return null
  if (!DAY.test(day) || !ISO.test(at) || Number.isNaN(Date.parse(at)) || !UUID.test(id)) return null
  return { day, at, id }
}

/** One check-in as the feed and the friend profile show it (plain data, crosses to the client). */
export type FeedEntry = {
  id: string
  cursor: FeedCursor
  person: { id: string; username: string; name: string; avatar: string | null; avatarPreset?: number | null }
  habit: { name: string; color: HabitColor }
  copy: string
  localDate: LocalDate
  /** "HH:mm" in the viewer's timezone. */
  time: string
  hasPhoto: boolean
  /** Signed URL (300 s, viewer's session); null when storage would not sign it. */
  photoUrl: string | null
  streak: { text: string; milestone: boolean } | null
  status: ReviewStatus
}

export type FeedPage = { items: FeedEntry[]; next: FeedCursor | null }

export type FeedFilter = 'all' | 'photos'
export const parseFilter = (value: unknown): FeedFilter => (value === 'photos' ? 'photos' : 'all')
