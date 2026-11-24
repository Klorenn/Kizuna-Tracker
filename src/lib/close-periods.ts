import { localDate } from '@/domain/dates'
import {
  evaluateItems,
  isPeriodClosable,
  itemAppliesTo,
  periodsFor,
  type ChallengeItemSpec,
  type Period,
} from '@/domain/challenges'
import type { LocalDate } from '@/domain/types'
import { closeDueGroupWeeks, isMissingFunction, type GroupsClient } from '@/lib/groups-rpc'

export type ActiveChallenge = {
  id: string
  creatorId: string
  rivalId: string
  /** The period unit of the whole challenge; every item shares it (each item has its own weekly target). */
  frequencyType: 'daily' | 'weekly'
  weeks: number
  fineAmount: number
  startsOn: LocalDate
  timezone: string
  /** The ACTIVE sub-retos (challenge_items). Photo items count only photo check-ins (a day done through steps does not). */
  items: ChallengeItemSpec[]
  /** Set when the challenge was cancelled/unfriended after it started; only periods that ended before it still count. */
  cancelledAt: Date | null
}

export type NewDebt = {
  challengeId: string
  periodStart: LocalDate
  debtorId: string
  creditorId: string
  amount: number
}

/** One row of challenge_item_results: how a player did on one item in one closed period. */
export type NewItemResult = {
  challengeId: string
  periodStart: LocalDate
  itemId: string
  playerId: string
  met: boolean
  done: number
  needed: number
}

export interface ClosePeriodsRepo {
  /**
   * Every active challenge, plus started challenges cancelled with `cancelled_at` set (their ended
   * periods still owe) that are not settled yet. Must read ALL of them (paged), never a capped subset.
   */
  activeChallenges(): Promise<ActiveChallenge[]>
  closedPeriodStarts(challengeId: string): Promise<LocalDate[]>
  /** `local_date` of the habit's non-rejected check-ins inside [from, to]. */
  checkinDates(habitId: string, from: LocalDate, to: LocalDate): Promise<LocalDate[]>
  /** Non-rejected photo check-ins of these habits whose day is inside [from, to]. */
  photoCheckins(
    habitIds: string[],
    from: LocalDate,
    to: LocalDate,
  ): Promise<{ habitId: string; localDate: LocalDate; createdAt: Date }[]>
  /** Insert-if-absent on (challenge, period, item, player). Never overwrites, so a rerun is a no-op. */
  insertItemResults(rows: NewItemResult[]): Promise<void>
  /** Insert-if-absent. Resolves true only when this call inserted the row. */
  insertPeriod(challengeId: string, period: Period, closedAt: Date): Promise<boolean>
  /** Insert-if-absent. Resolves true only when this call inserted the row. */
  insertDebt(debt: NewDebt): Promise<boolean>
  finishChallenge(challengeId: string): Promise<void>
  /** Marks a cancelled challenge as having nothing left to bill, so later runs skip it. */
  settleChallenge(challengeId: string): Promise<void>
  insertNotification(userId: string, type: string, payload: Record<string, unknown>): Promise<void>
}

/**
 * Closes every challenge period that is over (and whose photos can no longer be rejected),
 * turning failures into debts. Every active item (sub-reto) is evaluated per player and a
 * player who misses ANY of them owes ONE debt for the period. Safe to re-run: item results go
 * in first (unique per challenge/period/item/player), then the debts (unique per
 * challenge/period/debtor) and the period row last, so a crash in between is repaired by
 * the next run without duplicating anything. Tradeoff: if the run dies after a debt is inserted
 * but before its notification is, the retry sees the debt as already present and the
 * `new_debt` notification is lost (the debt itself is never lost).
 *
 * Each challenge runs in isolation: one failing challenge is logged and the rest continue.
 * Periods are ordered, so the first one that has not ended stops the scan, and per-challenge
 * data is fetched once and only when a period has actually ended.
 */
export async function closeDuePeriods(
  repo: ClosePeriodsRepo,
  now: Date,
): Promise<{ closed: number; debtsCreated: number }> {
  let closed = 0
  let debtsCreated = 0

  for (const c of await repo.activeChallenges()) {
    try {
      const r = await closeChallenge(repo, c, now)
      closed += r.closed
      debtsCreated += r.debtsCreated
    } catch (e) {
      console.error(`close-periods: challenge ${c.id} failed`, e)
    }
  }

  return { closed, debtsCreated }
}

async function closeChallenge(repo: ClosePeriodsRepo, c: ActiveChallenge, now: Date) {
  let closed = 0
  let debtsCreated = 0
  if (c.items.length === 0) return { closed, debtsCreated } // an active challenge always has items; never bill on none
  const periods = periodsFor(c.startsOn, c.weeks, c.frequencyType === 'daily' ? { type: 'daily' } : { type: 'weekly', target: 1 })
  const done = new Set(await repo.closedPeriodStarts(c.id))
  const today = localDate(now, c.timezone)
  const cutoff = c.cancelledAt ? localDate(c.cancelledAt, c.timezone) : null

  type Loaded = {
    datesByItem: Map<string, { creator: LocalDate[]; rival: LocalDate[] }>
    photos: { habitId: string; localDate: LocalDate; createdAt: Date }[]
  }
  // only the periods this run can still close: ended, before any cancel, not closed yet. Reads never start
  // before the first of them, so a long challenge does not re-read its whole history every day.
  const open = periods.filter((p) => today > p.end && (cutoff === null || p.end < cutoff) && !done.has(p.start))
  let loaded: Loaded | null = null
  const load = async (): Promise<Loaded> => {
    if (loaded) return loaded
    const from = open[0].start
    const to = open[open.length - 1].end
    // a rival can only reject the photos of a photo item, so only those habits hold a period open
    const photoHabits = c.items.filter((i) => i.requiresPhoto).flatMap((i) => [i.creatorHabitId, i.rivalHabitId])
    const photos = photoHabits.length > 0 ? await repo.photoCheckins(photoHabits, from, to) : []
    const datesOf = (habitId: string) => photos.filter((k) => k.habitId === habitId).map((k) => k.localDate)
    const datesByItem = new Map<string, { creator: LocalDate[]; rival: LocalDate[] }>()
    for (const i of c.items) {
      if (i.requiresPhoto) {
        // a photo item is met only with photos the rival could see and reject
        datesByItem.set(i.id, { creator: datesOf(i.creatorHabitId), rival: datesOf(i.rivalHabitId) })
        continue
      }
      const [creator, rival] = await Promise.all([
        repo.checkinDates(i.creatorHabitId, from, to),
        repo.checkinDates(i.rivalHabitId, from, to),
      ])
      datesByItem.set(i.id, { creator, rival })
    }
    return (loaded = { datesByItem, photos })
  }

  for (const period of periods) {
    if (today <= period.end) break // not over yet; later periods are not either
    if (cutoff !== null && period.end >= cutoff) break // the period in progress at cancel time owes nothing
    if (done.has(period.start)) continue

    const data = await load()
    // only the items that count in this period can hold it open (a photo of a not-yet-started item cannot)
    const habits = new Set(c.items.filter((i) => itemAppliesTo(i, period)).flatMap((i) => [i.creatorHabitId, i.rivalHabitId]))
    const photoTimes = data.photos
      .filter((k) => habits.has(k.habitId) && k.localDate >= period.start && k.localDate <= period.end)
      .map((k) => k.createdAt)
    if (!isPeriodClosable(period, c.timezone, now, photoTimes)) continue

    const { creatorFailed, rivalFailed, results } = evaluateItems(period, c.items, data.datesByItem)
    if (results.length > 0) {
      // written first, like the debts: a crash before the period row is repaired by the rerun (insert-if-absent)
      await repo.insertItemResults(
        results.map((r) => ({
          challengeId: c.id,
          periodStart: period.start,
          itemId: r.itemId,
          playerId: r.side === 'creator' ? c.creatorId : c.rivalId,
          met: r.met,
          done: r.done,
          needed: r.needed,
        })),
      )
    }
    const owed: { debtorId: string; creditorId: string; side: 'creator' | 'rival' }[] = []
    if (creatorFailed) owed.push({ debtorId: c.creatorId, creditorId: c.rivalId, side: 'creator' })
    if (rivalFailed) owed.push({ debtorId: c.rivalId, creditorId: c.creatorId, side: 'rival' })

    for (const o of owed) {
      const inserted = await repo.insertDebt({
        challengeId: c.id,
        periodStart: period.start,
        debtorId: o.debtorId,
        creditorId: o.creditorId,
        amount: c.fineAmount,
      })
      if (!inserted) continue
      debtsCreated++
      await repo.insertNotification(o.debtorId, 'new_debt', {
        challenge_id: c.id,
        period_start: period.start,
        creditor_id: o.creditorId,
        amount: c.fineAmount,
        item_ids: results.filter((r) => r.side === o.side && !r.met).map((r) => r.itemId),
      })
    }

    if (await repo.insertPeriod(c.id, period, now)) closed++
    done.add(period.start)
  }

  // A cancelled challenge never becomes 'finished'. Once every period that ended before the
  // cancel is closed it has nothing left to bill: settle it so later runs stop reading it.
  if (cutoff !== null) {
    if (periods.filter((p) => p.end < cutoff).every((p) => done.has(p.start))) await repo.settleChallenge(c.id)
  } else if (periods.length > 0 && periods.every((p) => done.has(p.start))) {
    await repo.finishChallenge(c.id)
  }
  return { closed, debtsCreated }
}

/** What the group half of the close-periods cron did. Never thrown: a group failure must not touch the challenge half. */
export type GroupWeeksOutcome =
  | { closed: number }
  | { skipped: 'not_installed' }
  | { timeout: true }
  | { error: 'failed' }

/** The group half never holds the cron response longer than this (the database finishes or rolls back each week on its own). */
export const GROUP_WEEKS_TIMEOUT_MS = 15_000

/**
 * Closes every due group week through `close_due_group_weeks` (service role, idempotent). Before migration 0023 is in
 * a database the function does not exist: that is logged as a warning and reported as `not_installed`, not as a failure.
 * Any other failure (an error answer, a thrown call, an answer that is not a number) is logged and reported as `failed`.
 */
export async function closeGroupWeeks(
  client: GroupsClient,
  timeoutMs: number = GROUP_WEEKS_TIMEOUT_MS,
): Promise<GroupWeeksOutcome> {
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      abort.abort()
      resolve('timeout')
    }, timeoutMs)
  })
  try {
    const answer = closeDueGroupWeeks(client, abort.signal)
    answer.catch(() => {}) // an aborted call that loses the race must not become an unhandled rejection
    const raced = await Promise.race([answer, timedOut])
    if (raced === 'timeout' || abort.signal.aborted) {
      console.warn(`close-periods: closing group weeks hit the ${timeoutMs / 1000}s limit; the response is not delayed further`)
      return { timeout: true }
    }
    const { data, error } = raced
    if (error) {
      if (isMissingFunction(error)) {
        console.warn('close-periods: close_due_group_weeks is not installed yet; skipping group weeks')
        return { skipped: 'not_installed' }
      }
      console.error('close-periods: closing group weeks failed', error.code ?? 'unknown')
      return { error: 'failed' }
    }
    if (typeof data !== 'number' || !Number.isFinite(data)) {
      console.error('close-periods: close_due_group_weeks returned an unexpected answer')
      return { error: 'failed' }
    }
    return { closed: data }
  } catch (e) {
    if (abort.signal.aborted) {
      console.warn(`close-periods: closing group weeks hit the ${timeoutMs / 1000}s limit`)
      return { timeout: true }
    }
    console.error('close-periods: closing group weeks threw', e instanceof Error ? e.name : 'unknown')
    return { error: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}
