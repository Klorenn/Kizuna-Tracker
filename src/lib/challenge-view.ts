import { periodsFor, type Period } from '@/domain/challenges'
import type { Frequency, LocalDate } from '@/domain/types'

type FrequencyRow = { frequency_type: string; target_per_week: number | null }
type ScheduleRow = FrequencyRow & { weeks: number; starts_on: string | null }

export function challengeFrequency(c: FrequencyRow): Frequency {
  return c.frequency_type === 'weekly'
    ? { type: 'weekly', target: c.target_per_week ?? 1 }
    : { type: 'daily' }
}

export function frequencyLabel(f: Frequency): string {
  return f.type === 'weekly' ? `${f.target} por semana` : 'Diario'
}

export type PeriodStatus =
  | { state: 'pending'; total: number }
  | { state: 'over'; total: number }
  | { state: 'running'; index: number; total: number; period: Period }

/** Where `today` sits in the challenge schedule. `index` is 1-based. */
export function periodStatus(c: ScheduleRow, today: LocalDate): PeriodStatus {
  const f = challengeFrequency(c)
  const total = f.type === 'daily' ? c.weeks * 7 : c.weeks
  if (!c.starts_on || today < c.starts_on) return { state: 'pending', total }
  const periods = periodsFor(c.starts_on, c.weeks, f)
  const i = periods.findIndex((p) => today >= p.start && today <= p.end)
  if (i === -1) return { state: 'over', total }
  return { state: 'running', index: i + 1, total, period: periods[i] }
}

/** Distinct check-in dates inside the period. */
export function countDone(period: Period, dates: LocalDate[]): number {
  return new Set(dates.filter((d) => d >= period.start && d <= period.end)).size
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** `YYYY-MM-DD` as "dom 29" (weekday + day). */
export function weekdayLabel(d: LocalDate): string {
  const [y, m, day] = d.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]} ${day}`
}

/** `YYYY-MM-DD` as "2 nov". */
export function dayMonthLabel(d: LocalDate): string {
  const [, m, day] = d.split('-').map(Number)
  return `${day} ${MONTHS[m - 1]}`
}

/** Last day of the challenge schedule. */
export function endsOn(c: ScheduleRow): LocalDate | null {
  if (!c.starts_on) return null
  const periods = periodsFor(c.starts_on, c.weeks, challengeFrequency(c))
  return periods[periods.length - 1].end
}

export const firstName = (displayName: string | null | undefined, fallback = 'Tu amigo') =>
  displayName?.trim().split(/\s+/)[0] || fallback

export type ItemRow = {
  id: string
  position: number
  status: string
  creator_habit_id: string | null
  rival_habit_id: string | null
  target_per_week: number | null
  requires_photo: boolean
  proposed_by: string
  starts_on: string | null
}

/** A live sub-reto (proposed or active) as one player sees it. */
export type ItemView = {
  id: string
  position: number
  status: 'proposed' | 'active'
  myHabitId: string | null
  theirHabitId: string | null
  /** null = daily (the challenge frequency has no per-item target) */
  target: number | null
  requiresPhoto: boolean
  startsOn: LocalDate | null
  /** Who has to answer a proposed item: the player who did not propose it. */
  pendingFor: 'me' | 'them' | null
}

/** Live items in position order, with the habits oriented to `me` (item columns are creator/rival side). */
export function itemViews(items: ItemRow[], c: { creator_id: string }, me: string): ItemView[] {
  const iAmCreator = c.creator_id === me
  return items
    .filter((i): i is ItemRow & { status: 'proposed' | 'active' } => i.status === 'proposed' || i.status === 'active')
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      id: i.id,
      position: i.position,
      status: i.status,
      myHabitId: iAmCreator ? i.creator_habit_id : i.rival_habit_id,
      theirHabitId: iAmCreator ? i.rival_habit_id : i.creator_habit_id,
      target: i.target_per_week,
      requiresPhoto: i.requires_photo,
      startsOn: i.starts_on,
      pendingFor: i.status === 'proposed' ? (i.proposed_by === me ? 'them' : 'me') : null,
    }))
}

export type ItemProgress =
  | { type: 'weekly'; target: number; you: number; them: number }
  | { type: 'daily'; youDone: boolean; themDone: boolean }

/**
 * Progress of one active item in the running period; null while the item is not counting yet
 * (not active, or it starts after this period began).
 */
export function itemProgress(
  item: ItemView,
  frequencyType: 'daily' | 'weekly',
  period: Period,
  datesOf: (habitId: string) => LocalDate[],
): ItemProgress | null {
  if (item.status !== 'active' || !item.startsOn || item.startsOn > period.start) return null
  const mine = item.myHabitId ? countDone(period, datesOf(item.myHabitId)) : 0
  const theirs = item.theirHabitId ? countDone(period, datesOf(item.theirHabitId)) : 0
  return frequencyType === 'weekly'
    ? { type: 'weekly', target: item.target ?? 1, you: mine, them: theirs }
    : { type: 'daily', youDone: mine > 0, themDone: theirs > 0 }
}

/** "+2 sub-retos" next to the first item's name; null when the challenge has a single item. */
export function subRetosLabel(count: number): string | null {
  if (count <= 1) return null
  const extra = count - 1
  return `+${extra} ${extra === 1 ? 'sub-reto' : 'sub-retos'}`
}

/**
 * Check-in dates of one habit that count for a sub-reto, as the close-periods cron counts them:
 * not rejected, from the item's start, and photo check-ins only for a photo sub-reto.
 */
export function countingDates(
  rows: { habit_id: string; local_date: LocalDate; photo_path: string | null; rejected_at: string | null }[],
  habitId: string,
  requiresPhoto: boolean,
  startsOn: LocalDate | null,
): LocalDate[] {
  return rows
    .filter(
      (k) =>
        k.habit_id === habitId &&
        !k.rejected_at &&
        (!requiresPhoto || k.photo_path) &&
        (startsOn === null || k.local_date >= startsOn),
    )
    .map((k) => k.local_date)
}

/** Habit names of every sub-reto (any status: results outlive the item) oriented to the viewer, in position order. */
export function itemNamesOf(
  items: { id: string; position: number; creator_habit_id: string | null; rival_habit_id: string | null }[],
  iAmCreator: boolean,
  nameOf: (habitId: string | null) => string | undefined,
): ItemNames {
  return new Map(
    [...items]
      .sort((a, b) => a.position - b.position)
      .map((i) => {
        const mine = iAmCreator ? i.creator_habit_id : i.rival_habit_id
        const theirs = iAmCreator ? i.rival_habit_id : i.creator_habit_id
        return [i.id, { mine: nameOf(mine) ?? '', theirs: nameOf(theirs) ?? '' }] as const
      }),
  )
}

export type HistoryDebt = { period_start: string; debtor_id: string; amount: number; paid_at: string | null }

export type ItemResultRow = { period_start: string; item_id: string; player_id: string; met: boolean }
/** Habit names of an item from each player's side, relative to the viewer. */
export type ItemNames = Map<string, { mine: string; theirs: string }>

export type FailureRow = {
  start: LocalDate
  /** 1-based position in the schedule */
  n: number
  summary: string
  /** Only when exactly one player failed: what is owed for this period. */
  debt: { amount: number; paid: boolean } | null
}

/**
 * "Historial de fallas" for closed periods, built from the ledger: a debt row for a player means
 * that player failed the period, none means both met it. Debts are readable by both players for
 * good, while the rival's check-ins disappear with the friendship (unfriend, account deletion),
 * so counts are decoration only: shown while visible (`theirDates` is null when hidden) and
 * consistent with the debt. Periods with a debt but no closed row (a crash in between) are kept.
 */
export function failureHistory(args: {
  periods: Period[]
  closedStarts: Iterable<LocalDate>
  debts: HistoryDebt[]
  myId: string
  otherName: string
  frequency: Frequency
  myDates: LocalDate[]
  theirDates: LocalDate[] | null
  /** Per-item outcomes of closed periods. Periods closed before sub-retos have none: legacy text. */
  itemResults?: ItemResultRow[]
  itemNames?: ItemNames
  limit?: number
}): FailureRow[] {
  const { periods, debts, myId, otherName, frequency, myDates, theirDates, limit = 12 } = args
  const itemResults = args.itemResults ?? []
  const itemNames = args.itemNames
  /** Sub-retos a player failed in the period, by the failing player's habit; null with no result rows. */
  const failedItems = (start: LocalDate, player: string, mineSide: boolean): string[] | null => {
    const rows = itemResults.filter((r) => r.period_start === start)
    if (rows.length === 0 || !itemNames) return null
    const failed = new Set(rows.filter((r) => r.player_id === player && !r.met).map((r) => r.item_id))
    if (failed.size === 0) return null
    return [...itemNames]
      .filter(([id]) => failed.has(id))
      .map(([, n]) => (mineSide ? n.mine : n.theirs) || 'Sub-reto')
  }
  const shown = new Set([...args.closedStarts, ...debts.map((d) => d.period_start)])
  const need = frequency.type === 'weekly' ? frequency.target : 1
  const counted = (p: Period, dates: LocalDate[] | null) => {
    if (frequency.type !== 'weekly' || dates === null) return null
    const done = countDone(p, dates)
    return done < need ? done : null
  }

  return periods
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => shown.has(p.start))
    .reverse()
    .slice(0, limit)
    .map(({ p, n }): FailureRow => {
      const mine = debts.find((d) => d.period_start === p.start && d.debtor_id === myId)
      const theirs = debts.find((d) => d.period_start === p.start && d.debtor_id !== myId)
      const owed = mine ?? theirs
      if (!owed) return { start: p.start, n, summary: 'Los dos cumplieron', debt: null }
      if (mine && theirs) return { start: p.start, n, summary: 'Fallaron los dos · se compensa', debt: null }
      const done = counted(p, mine ? myDates : theirDates)
      const named = failedItems(p.start, mine ? myId : (theirs as HistoryDebt).debtor_id, Boolean(mine))
      const summary = named
        ? mine
          ? `No cumpliste: ${named.join(', ')}`
          : `${otherName} no cumplió: ${named.join(', ')}`
        : mine
          ? done === null
            ? 'No cumpliste'
            : `Hiciste ${done} de ${need}`
          : done === null
            ? `${otherName} no cumplió`
            : `${otherName} hizo ${done} de ${need}`
      return { start: p.start, n, summary, debt: { amount: owed.amount, paid: owed.paid_at !== null } }
    })
}

/** Why a challenge was cancelled, when the data says so. */
export function cancelledLabel(c: { starts_on: string | null; cancel_requested_by: string | null }): string {
  if (c.cancel_requested_by) return 'Cancelado entre los dos'
  if (!c.starts_on) return 'Propuesta retirada'
  return 'Cancelado'
}
