import { evaluatePeriod, isPeriodClosable, periodsFor, type Period } from '@/domain/challenges'
import type { Frequency, LocalDate } from '@/domain/types'

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
}

export type NewDebt = {
  challengeId: string
  periodStart: LocalDate
  debtorId: string
  creditorId: string
  amount: number
}

export interface ClosePeriodsRepo {
  /** Challenges with status 'active' that already have a start date and both habits. */
  activeChallenges(): Promise<ActiveChallenge[]>
  closedPeriodStarts(challengeId: string): Promise<LocalDate[]>
  /** `local_date` of the habit's non-rejected check-ins inside [from, to]. */
  checkinDates(habitId: string, from: LocalDate, to: LocalDate): Promise<LocalDate[]>
  /** `created_at` of non-rejected photo check-ins of these habits whose day is inside [from, to]. */
  photoCheckinCreatedAts(habitIds: string[], from: LocalDate, to: LocalDate): Promise<Date[]>
  /** Insert-if-absent. Resolves true only when this call inserted the row. */
  insertPeriod(challengeId: string, period: Period, closedAt: Date): Promise<boolean>
  /** Insert-if-absent. Resolves true only when this call inserted the row. */
  insertDebt(debt: NewDebt): Promise<boolean>
  finishChallenge(challengeId: string): Promise<void>
  insertNotification(userId: string, type: string, payload: Record<string, unknown>): Promise<void>
}

/**
 * Closes every challenge period that is over (and whose photos can no longer be rejected),
 * turning failures into debts. Safe to re-run: debts go in first (unique per
 * challenge/period/debtor) and the period row last, so a crash in between is repaired by
 * the next run without duplicating debts or notifications.
 */
export async function closeDuePeriods(
  repo: ClosePeriodsRepo,
  now: Date,
): Promise<{ closed: number; debtsCreated: number }> {
  let closed = 0
  let debtsCreated = 0

  for (const c of await repo.activeChallenges()) {
    const periods = periodsFor(c.startsOn, c.weeks, c.frequency)
    const done = new Set(await repo.closedPeriodStarts(c.id))

    for (const period of periods) {
      if (done.has(period.start)) continue
      const photos = await repo.photoCheckinCreatedAts([c.creatorHabitId, c.rivalHabitId], period.start, period.end)
      if (!isPeriodClosable(period, c.timezone, now, photos)) continue

      const [creatorDates, rivalDates] = await Promise.all([
        repo.checkinDates(c.creatorHabitId, period.start, period.end),
        repo.checkinDates(c.rivalHabitId, period.start, period.end),
      ])
      const { creatorFailed, rivalFailed } = evaluatePeriod(period, c.frequency, creatorDates, rivalDates)

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

    if (periods.length > 0 && periods.every((p) => done.has(p.start))) {
      await repo.finishChallenge(c.id)
    }
  }

  return { closed, debtsCreated }
}
