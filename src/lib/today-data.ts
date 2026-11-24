import { groupChipsByHabit } from "@/domain/group-habits";
import { loadMyGroups } from "@/lib/groups-data";
import type { createServerClient } from "@/lib/supabase/server";
import { loadTodayCore, type TodayData } from "@/lib/today-core";

export { HISTORY_DAYS, type TodayData } from "@/lib/today-core";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** Hoy's data for the web page: `loadTodayCore` with the group chips read through the server-side `loadMyGroups`. */
export async function loadTodayData(
  supabase: Supabase,
  userId: string,
  profileRead: Promise<{ timezone: string } | null>,
  now: Date = new Date(),
): Promise<TodayData> {
  return loadTodayCore(supabase, userId, profileRead, now, () =>
    loadMyGroups(supabase).then((r) => (r.ok ? groupChipsByHabit(r.data) : new Map())),
  );
}
