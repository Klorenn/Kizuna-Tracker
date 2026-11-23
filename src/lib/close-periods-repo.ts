import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { challengeFrequency } from '@/lib/challenge-view'
import type { ClosePeriodsRepo } from '@/lib/close-periods'
import { fetchAll } from '@/lib/paginate'
import type { Database, Json } from '@/lib/supabase/database.types'

/** Service-role implementation. Reads challenges and check-ins directly (no RLS, no is_friend). */
export function createClosePeriodsRepo(db: SupabaseClient<Database>): ClosePeriodsRepo {
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`${what}: ${error.message}`)
  }
  return {
    async activeChallenges() {
      // paged: a single select stops at max_rows and would silently skip challenges (and debts)
      const data = await fetchAll((from, to) =>
        db
          .from('challenges')
          .select(
            'id,creator_id,rival_id,creator_habit_id,rival_habit_id,frequency_type,target_per_week,weeks,fine_amount,starts_on,timezone,requires_photo,cancelled_at',
          )
          .or('status.eq.active,and(status.eq.cancelled,cancelled_at.not.is.null)')
          .is('settled_at', null)
          .not('starts_on', 'is', null)
          .not('rival_habit_id', 'is', null)
          .order('id')
          .range(from, to),
      ).catch((e: Error) => fail('activeChallenges', e))
      return data.flatMap((c) =>
        c.starts_on && c.rival_habit_id
          ? [
              {
                id: c.id,
                creatorId: c.creator_id,
                rivalId: c.rival_id,
                creatorHabitId: c.creator_habit_id,
                rivalHabitId: c.rival_habit_id,
                frequency: challengeFrequency(c),
                weeks: c.weeks,
                fineAmount: c.fine_amount,
                startsOn: c.starts_on,
                timezone: c.timezone,
                requiresPhoto: c.requires_photo,
                cancelledAt: c.cancelled_at ? new Date(c.cancelled_at) : null,
              },
            ]
          : [],
      )
    },

    async closedPeriodStarts(challengeId) {
      const { data, error } = await db
        .from('challenge_periods')
        .select('period_start')
        .eq('challenge_id', challengeId)
        .not('closed_at', 'is', null)
      if (error) fail('closedPeriodStarts', error)
      return (data ?? []).map((p) => p.period_start)
    },

    async checkinDates(habitId, from, to) {
      const { data, error } = await db
        .from('checkins')
        .select('local_date')
        .eq('habit_id', habitId)
        .is('rejected_at', null)
        .gte('local_date', from)
        .lte('local_date', to)
      if (error) fail('checkinDates', error)
      return (data ?? []).map((k) => k.local_date)
    },

    async photoCheckins(habitIds, from, to) {
      const { data, error } = await db
        .from('checkins')
        .select('habit_id,local_date,created_at')
        .in('habit_id', habitIds)
        .is('rejected_at', null)
        .not('photo_path', 'is', null)
        .gte('local_date', from)
        .lte('local_date', to)
      if (error) fail('photoCheckins', error)
      return (data ?? []).map((k) => ({ habitId: k.habit_id, localDate: k.local_date, createdAt: new Date(k.created_at) }))
    },

    async insertPeriod(challengeId, period, closedAt) {
      const { data, error } = await db
        .from('challenge_periods')
        .upsert(
          { challenge_id: challengeId, period_start: period.start, period_end: period.end, closed_at: closedAt.toISOString() },
          { onConflict: 'challenge_id,period_start', ignoreDuplicates: true },
        )
        .select('id')
      if (error) fail('insertPeriod', error)
      return (data ?? []).length > 0
    },

    async insertDebt(d) {
      const { data, error } = await db
        .from('debts')
        .upsert(
          {
            challenge_id: d.challengeId,
            period_start: d.periodStart,
            debtor_id: d.debtorId,
            creditor_id: d.creditorId,
            amount: d.amount,
          },
          { onConflict: 'challenge_id,period_start,debtor_id', ignoreDuplicates: true },
        )
        .select('id')
      if (error) fail('insertDebt', error)
      return (data ?? []).length > 0
    },

    async finishChallenge(challengeId) {
      const { error } = await db.from('challenges').update({ status: 'finished' }).eq('id', challengeId).eq('status', 'active')
      if (error) fail('finishChallenge', error)
    },

    async settleChallenge(challengeId) {
      const { error } = await db
        .from('challenges')
        .update({ settled_at: new Date().toISOString() })
        .eq('id', challengeId)
        .eq('status', 'cancelled')
        .is('settled_at', null)
      if (error) fail('settleChallenge', error)
    },

    async insertNotification(userId, type, payload) {
      const { error } = await db.from('notifications').insert({ user_id: userId, type, payload: payload as Json })
      if (error) fail('insertNotification', error)
    },
  }
}
