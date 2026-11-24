import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/paginate'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Every check-in of the given habits inside the challenge dates, newest first. Paged: a challenge with several
 * sub-retos over many weeks passes PostgREST's max_rows, and a silent cut would lose days from the progress bars.
 * `id` is the unique tiebreaker that keeps the pages stable.
 */
export function readChallengeCheckins(db: SupabaseClient<Database>, habitIds: string[], from: string, to: string) {
  return fetchAll((f, t) =>
    db
      .from('checkins')
      .select('id,habit_id,local_date,photo_path,is_duplicate,rejected_at,rejected_by,reject_reason,created_at')
      .in('habit_id', habitIds)
      .gte('local_date', from)
      .lte('local_date', to)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(f, t),
  )
}
