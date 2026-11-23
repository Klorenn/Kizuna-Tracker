import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { dayLabel, monthBounds, monthGrid, type MonthKey } from '@/domain/calendar'
import { addDays } from '@/domain/dates'
import type { LocalDate } from '@/domain/types'
import { REJECT_REASONS, type RejectReason } from '@/lib/challenge-form'

/** An item (step) of a habit, active from `since` and until the day before `until`. */
export type CalendarItem = { id: string; label: string; position: number; since: LocalDate; until: LocalDate | null }
export type CalendarHabitInput = { id: string; since: LocalDate; items: CalendarItem[] }

export type CheckinRow = {
  id: string
  habit_id: string
  local_date: LocalDate
  created_at: string
  photo_path: string | null
  rejected_at: string | null
  reject_reason: string | null
}
export type CheckinItemRow = {
  item_id: string
  habit_id: string
  local_date: LocalDate
  created_at: string
  photo_path: string | null
}

/** done: counted check-in. rejected: a friend rejected its photo. partial: some items, no check-in. */
export type DayStatus = 'done' | 'rejected' | 'partial' | 'pending' | 'none'

export type HabitDay = {
  habitId: string
  status: DayStatus
  /** Local `HH:mm` of the check-in (or of the last item while in progress). */
  time: string | null
  /** Items checked that day out of the items active that day, labels in list order. */
  items: { done: number; total: number; labels: string[] } | null
  /** Storage paths in the private `proofs` bucket: the check-in photo first, then item photos. */
  photos: { path: string; label: string | null }[]
  rejectReason: RejectReason | null
}

const RECORD: ReadonlySet<DayStatus> = new Set(['done', 'rejected', 'partial'])

const localTime = (iso: string, tz: string) => format(new TZDate(new Date(iso), tz), 'HH:mm')

const toReason = (r: string | null): RejectReason =>
  (REJECT_REASONS as readonly string[]).includes(r ?? '') ? (r as RejectReason) : 'other'

/**
 * Per-day, per-habit summary for the calendar and its day sheet. Days after `today` are
 * skipped; a habit shows from the day it was created, or earlier when it has records then.
 */
export function buildDaySummaries(input: {
  habits: CalendarHabitInput[]
  checkins: CheckinRow[]
  checkinItems: CheckinItemRow[]
  dates: LocalDate[]
  today: LocalDate
  timezone: string
}): Record<LocalDate, HabitDay[]> {
  const { habits, checkins, checkinItems, today, timezone } = input
  const key = (habitId: string, date: LocalDate) => `${habitId}|${date}`
  const checkinBy = new Map(checkins.map((c) => [key(c.habit_id, c.local_date), c]))
  const itemsBy = new Map<string, CheckinItemRow[]>()
  for (const ci of checkinItems) {
    const k = key(ci.habit_id, ci.local_date)
    const list = itemsBy.get(k)
    if (list) list.push(ci)
    else itemsBy.set(k, [ci])
  }

  const out: Record<LocalDate, HabitDay[]> = {}
  for (const date of input.dates) {
    if (date > today) continue
    const entries: HabitDay[] = []
    for (const habit of habits) {
      const c = checkinBy.get(key(habit.id, date))
      const checked = itemsBy.get(key(habit.id, date)) ?? []
      if (date < habit.since && !c && checked.length === 0) continue

      const itemById = new Map(habit.items.map((i) => [i.id, i]))
      const checkedIds = new Set(checked.map((ci) => ci.item_id))
      const active = habit.items.filter(
        (i) => checkedIds.has(i.id) || (i.since <= date && (i.until === null || i.until > date)),
      )
      const items =
        checked.length > 0
          ? {
              done: checked.length,
              total: Math.max(active.length, checked.length),
              labels: [...checked]
                .sort((a, b) => (itemById.get(a.item_id)?.position ?? 0) - (itemById.get(b.item_id)?.position ?? 0))
                .map((ci) => itemById.get(ci.item_id)?.label ?? 'Paso'),
            }
          : null

      const photos: HabitDay['photos'] = []
      if (c?.photo_path) photos.push({ path: c.photo_path, label: null })
      for (const ci of [...checked].sort(
        (a, b) => (itemById.get(a.item_id)?.position ?? 0) - (itemById.get(b.item_id)?.position ?? 0),
      )) {
        if (ci.photo_path) photos.push({ path: ci.photo_path, label: itemById.get(ci.item_id)?.label ?? null })
      }

      let status: DayStatus
      let time: string | null = null
      if (c) {
        status = c.rejected_at ? 'rejected' : 'done'
        time = localTime(c.created_at, timezone)
      } else if (checked.length > 0) {
        status = 'partial'
        const last = checked.reduce((a, b) => (a.created_at > b.created_at ? a : b))
        time = localTime(last.created_at, timezone)
      } else {
        status = date === today ? 'pending' : 'none'
      }

      entries.push({
        habitId: habit.id,
        status,
        time,
        items,
        photos,
        rejectReason: c?.rejected_at ? toReason(c.reject_reason) : null,
      })
    }
    out[date] = entries
  }
  return out
}

/** Something happened that day: a check-in (counted or rejected) or items in progress. */
export function hasRecords(entries: HabitDay[]): boolean {
  return entries.some((e) => RECORD.has(e.status))
}

function statusPhrase(e: HabitDay): string {
  switch (e.status) {
    case 'done':
      return 'hecho'
    case 'rejected':
      return 'con foto rechazada'
    case 'partial':
      return e.items ? `${e.items.done} de ${e.items.total}` : 'en progreso'
    case 'pending':
      return 'pendiente'
    default:
      return 'no registrado'
  }
}

/** Screen reader name of a day cell: "23 de noviembre: Leer hecho, Gimnasio no registrado". */
export function dayAriaLabel(
  date: LocalDate,
  today: LocalDate,
  entries: HabitDay[],
  names: Record<string, string>,
): string {
  const when = date === today ? `Hoy, ${dayLabel(date)}` : dayLabel(date)
  if (entries.length === 0) return `${when}: sin registros`
  return `${when}: ${entries.map((e) => `${names[e.habitId] ?? 'Hábito'} ${statusPhrase(e)}`).join(', ')}`
}

export type OverviewCell = { date: LocalDate; inMonth: boolean; future: boolean; level: 0 | 1 | 2 | 3 | 4 }
export type MonthOverview = { month: MonthKey; daysDone: number; bestRun: number; cells: OverviewCell[][] }

/**
 * Mini heatmap of a month. `doneByDay` counts the habits done each day; the level is that
 * count over the habits that already existed that day. A day counts as completed with at
 * least one; the best run is the longest streak of completed days inside the month.
 */
export function monthOverview(
  month: MonthKey,
  doneByDay: Record<LocalDate, number>,
  habits: { since: LocalDate }[],
  today: LocalDate,
): MonthOverview {
  const level = (date: LocalDate): OverviewCell['level'] => {
    const done = doneByDay[date] ?? 0
    if (done <= 0) return 0
    const active = Math.max(done, habits.filter((h) => h.since <= date).length, 1)
    const ratio = done / active
    return ratio >= 1 ? 4 : ratio >= 2 / 3 ? 3 : ratio >= 1 / 3 ? 2 : 1
  }
  const cells = monthGrid(month).map((week) =>
    week.map((d) => ({
      date: d.date,
      inMonth: d.inMonth,
      future: d.date > today,
      level: d.inMonth && d.date <= today ? level(d.date) : (0 as const),
    })),
  )

  const { first, last } = monthBounds(month)
  let daysDone = 0
  let bestRun = 0
  let run = 0
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if ((doneByDay[d] ?? 0) > 0) {
      daysDone++
      run++
      bestRun = Math.max(bestRun, run)
    } else {
      run = 0
    }
  }
  return { month, daysDone, bestRun, cells }
}
