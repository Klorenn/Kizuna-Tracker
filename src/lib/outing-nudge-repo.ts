import { nudgeAudience, type OutingNudgeDeps } from '@/lib/outing-nudge'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

async function ownerIds(db: Db): Promise<string[]> {
  const ids: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('outings').select('owner_id').order('owner_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    for (const row of rows) ids.push(row.owner_id)
    if (rows.length < 1000) break
  }
  return ids
}

async function acceptedInviteeIds(db: Db): Promise<string[]> {
  const ids: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('outing_invites')
      .select('invitee_id')
      .eq('status', 'accepted')
      .order('invitee_id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    for (const row of rows) ids.push(row.invitee_id)
    if (rows.length < 1000) break
  }
  return ids
}

/** Profiles that already have a map. Service role. The client never reads these tables. */
export function outingNudgeDeps(db: Db): OutingNudgeDeps {
  return {
    async listOwners() {
      const audience = nudgeAudience(await ownerIds(db), await acceptedInviteeIds(db))
      const out: { id: string; timezone: string }[] = []
      for (let i = 0; i < audience.length; i += 100) {
        const slice = audience.slice(i, i + 100)
        const { data, error } = await db.from('profiles').select('id, timezone').in('id', slice).is('deleted_at', null)
        if (error) throw new Error(error.message)
        for (const row of data ?? []) {
          if (row.id && row.timezone) out.push({ id: row.id, timezone: row.timezone })
        }
      }
      return out
    },
    async completed(userId, monthStart) {
      const { data: invites, error: inviteError } = await db
        .from('outing_invites')
        .select('outing_id')
        .eq('invitee_id', userId)
        .eq('status', 'accepted')
      if (inviteError) throw new Error(inviteError.message)
      const accepted = (invites ?? []).map((row) => row.outing_id).filter((id): id is string => typeof id === 'string')
      let query = db
        .from('outings')
        .select('id', { count: 'exact', head: true })
        .eq('month_start', monthStart)
        .eq('status', 'went')
      query = accepted.length > 0 ? query.or(`owner_id.eq.${userId},id.in.(${accepted.join(',')})`) : query.eq('owner_id', userId)
      const { count, error } = await query
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    async claim(userId, localDate) {
      const { error } = await db.from('notification_log').insert({
        user_id: userId,
        kind: 'outing_month_nudge',
        local_date: localDate,
      })
      if (!error) return true
      if (error.code === '23505') return false
      throw new Error(error.message)
    },
    async insertInApp(userId) {
      const { error } = await db.from('notifications').insert({
        user_id: userId,
        type: 'outing_month_nudge',
        payload: {},
        pushed_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
    },
  }
}
