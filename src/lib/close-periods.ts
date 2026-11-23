import { localDate } from '@/domain/dates'
import { evaluatePeriod, isPeriodClosable, periodsFor, type Period } from '@/domain/challenges'
import type { Frequency, LocalDate } from '@/domain/types'
import { closeDueGroupWeeks, isMissingFunction, type GroupsClient } from '@/lib/groups-rpc'

export type ActiveChallenge = {
  id: string
  creatorId: string
  rivalId: string
  creatorHabitId: string
  rivalHabitId: string
  frequency: Frequency
  weeks: number
  fineAmount: number
  startsOn: LocalDate
  timezone: string
  /** Only photo check-ins count: a day completed through steps (no photo, not rejectable) does not. */
  requiresPhoto: boolean
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
 * turning failures into debts. Safe to re-run: debts go in first (unique per
 * challenge/period/debtor) and the period row last, so a crash in between is repaired by
 * the next run without duplicating debts. Tradeoff: if the run dies after a debt is inserted
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
  const periods = periodsFor(c.startsOn, c.weeks, c.frequency)
  const done = new Set(await repo.closedPeriodStarts(c.id))
  const today = localDate(now, c.timezone)
  const cutoff = c.cancelledAt ? localDate(c.cancelledAt, c.timezone) : null

  type Loaded = {
    creator: LocalDate[]
    rival: LocalDate[]
    photos: { habitId: string; localDate: LocalDate; createdAt: Date }[]
  }
  let loaded: Loaded | null = null
  const load = async (): Promise<Loaded> => {
    if (loaded) return loaded
    const from = periods[0].start
    const to = periods[periods.length - 1].end
    const photos = await repo.photoCheckins([c.creatorHabitId, c.rivalHabitId], from, to)
    if (c.requiresPhoto) {
      // a photo challenge is met only with photos the rival could see and reject
      const datesOf = (habitId: string) => photos.filter((k) => k.habitId === habitId).map((k) => k.localDate)
      return (loaded = { creator: datesOf(c.creatorHabitId), rival: datesOf(c.rivalHabitId), photos })
    }
    const [creator, rival] = await Promise.all([
      repo.checkinDates(c.creatorHabitId, from, to),
      repo.checkinDates(c.rivalHabitId, from, to),
    ])
    return (loaded = { creator, rival, photos })
  }

  for (const period of periods) {
    if (today <= period.end) break // not over yet; later periods are not either
    if (cutoff !== null && period.end >= cutoff) break // the period in progress at cancel time owes nothing
    if (done.has(period.start)) continue

    const data = await load()
    const photoTimes = data.photos
      .filter((k) => k.localDate >= period.start && k.localDate <= period.end)
      .map((k) => k.createdAt)
    if (!isPeriodClosable(period, c.timezone, now, photoTimes)) continue

    const { creatorFailed, rivalFailed } = evaluatePeriod(period, c.frequency, data.creator, data.rival)
    const owed: { debtorId: string; creditorId: string }[] = []
    if (creatorFailed) owed.push({ debtorId: c.creatorId, creditorId: c.rivalId })
    if (rivalFailed) owed.push({ debtorId: c.rivalId, creditorId: c.creatorId })

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
