import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChallengeItemSpec } from '@/domain/challenges'
import { challengeFrequency } from '@/lib/challenge-view'
import type { ActiveChallenge, ClosePeriodsRepo } from '@/lib/close-periods'
import { fetchAll } from '@/lib/paginate'
import type { Database, Json } from '@/lib/supabase/database.types'

// TODO(sub-retos types): drop these casts once database.types.ts knows challenge_items / challenge_item_results.
const untyped = (db: SupabaseClient<Database>) => db as unknown as SupabaseClient

type ItemRow = {
  id: string
  creator_habit_id: string | null
  rival_habit_id: string | null
  target_per_week: number | null
  requires_photo: boolean
  starts_on: string | null
  status: string
}
type ChallengeRow = {
  id: string
  creator_id: string
  rival_id: string
  frequency_type: string
  weeks: number
  fine_amount: number
  starts_on: string | null
  timezone: string
  cancelled_at: string | null
  challenge_items: ItemRow[]
}
type ItemsQuery = {
  select(columns: string): ItemsQuery
  eq(column: string, value: string): ItemsQuery
  or(filter: string): ItemsQuery
  is(column: string, value: null): ItemsQuery
  not(column: string, op: string, value: null): ItemsQuery
  order(column: string): ItemsQuery
  range(from: number, to: number): PromiseLike<{ data: ChallengeRow[] | null; error: { message: string } | null }>
}

/**
 * One challenge with its active items. The frequency of an item is the challenge's unit with the item's own weekly target.
 * An item that cannot be evaluated (a side without habit, no start) is skipped; a challenge left with no start or no items
 * is not returned at all (the cron never bills on an empty item list).
 */
function toActiveChallenge(c: ChallengeRow): ActiveChallenge[] {
  if (!c.starts_on) return []
  const items = (c.challenge_items ?? []).flatMap((i): ChallengeItemSpec[] =>
    i.creator_habit_id && i.rival_habit_id && i.starts_on
      ? [
          {
            id: i.id,
            creatorHabitId: i.creator_habit_id,
            rivalHabitId: i.rival_habit_id,
            frequency: challengeFrequency({ frequency_type: c.frequency_type, target_per_week: i.target_per_week }),
            requiresPhoto: i.requires_photo,
            startsOn: i.starts_on,
          },
        ]
      : [],
  )
  if (items.length === 0) return []
  return [
    {
      id: c.id,
      creatorId: c.creator_id,
      rivalId: c.rival_id,
      frequencyType: c.frequency_type === 'weekly' ? 'weekly' : 'daily',
      weeks: c.weeks,
      fineAmount: c.fine_amount,
      startsOn: c.starts_on,
      timezone: c.timezone,
      cancelledAt: c.cancelled_at ? new Date(c.cancelled_at) : null,
      items,
    },
  ]
}

/** Service-role implementation. Reads challenges and check-ins directly (no RLS, no is_friend). */
export function createClosePeriodsRepo(db: SupabaseClient<Database>): ClosePeriodsRepo {
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`${what}: ${error.message}`)
  }
  return {
    async activeChallenges() {
      // paged: a single select stops at max_rows and would silently skip challenges (and debts)
      const data = await fetchAll((from, to) =>
        // TODO(sub-retos types): challenge_items is not in database.types.ts until it is regenerated (batch 6)
        (untyped(db).from('challenges') as unknown as ItemsQuery)
          .select(
            'id,creator_id,rival_id,frequency_type,weeks,fine_amount,starts_on,timezone,cancelled_at,challenge_items!inner(id,creator_habit_id,rival_habit_id,target_per_week,requires_photo,starts_on,status)',
          )
          .eq('challenge_items.status', 'active')
          .or('status.eq.active,and(status.eq.cancelled,cancelled_at.not.is.null)')
          .is('settled_at', null)
          .not('starts_on', 'is', null)
          .order('id')
          .range(from, to),
      ).catch((e: Error) => fail('activeChallenges', e))
      return data.flatMap(toActiveChallenge)
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

    async insertItemResults(rows) {
      if (rows.length === 0) return
      // TODO(sub-retos types): challenge_item_results is not in database.types.ts until it is regenerated (batch 6)
      const { error } = await untyped(db)
        .from('challenge_item_results')
        .upsert(
          rows.map((r) => ({
            challenge_id: r.challengeId,
            period_start: r.periodStart,
            item_id: r.itemId,
            player_id: r.playerId,
            met: r.met,
            done: r.done,
            needed: r.needed,
          })),
          { onConflict: 'challenge_id,period_start,item_id,player_id', ignoreDuplicates: true },
        )
      if (error) fail('insertItemResults', error)
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
