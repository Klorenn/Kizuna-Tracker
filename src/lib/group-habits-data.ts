import type { GroupHabitCandidate } from '@/domain/group-habits'
import { GROUP_LOAD_COPY } from '@/lib/groups-copy'
import { createServerClient } from '@/lib/supabase/server'

type Client = Awaited<ReturnType<typeof createServerClient>>

/**
 * The caller's live, non-private habits with what the group rules look at. The rest of the rule
 * (not a quantity habit, photo proof, not linked to another group) is `eligibleGroupHabits`.
 * A failed read is an error, never an empty list: "no habits to choose from" would be a lie.
 */
export async function loadHabitCandidates(
  userId: string,
  client?: Client,
): Promise<{ ok: true; data: GroupHabitCandidate[] } | { ok: false; error: string }> {
  try {
    const supabase = client ?? (await createServerClient())
    const { data, error } = await supabase
      .from('habits')
      .select('id,name,visibility,requires_photo,log_type,archived_at')
      .eq('user_id', userId)
      .is('archived_at', null)
      .neq('visibility', 'private')
      .order('created_at')
    if (error || !Array.isArray(data)) return { ok: false, error: GROUP_LOAD_COPY }
    return { ok: true, data: data as GroupHabitCandidate[] }
  } catch {
    return { ok: false, error: GROUP_LOAD_COPY }
  }
}
