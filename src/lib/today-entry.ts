import type { LogType } from "@/domain/logs";
import type { createServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

const TABLES = {
  reading: "reading_entries",
  workout: "workout_sessions",
  time: "time_entries",
  watch: "watch_entries",
  cardio: "cardio_entries",
} as const;

export type Logged = { ok: true; logged: boolean } | { ok: false };

/**
 * Whether a check-in already has its detailed log. A failed count is `{ ok: false }`: the page
 * must show a retry line, not an "Añadir" or "Editar" link chosen by a guess.
 */
export async function countLogged(supabase: Supabase, logType: LogType, checkinId: string): Promise<Logged> {
  if (!(logType in TABLES)) return { ok: true, logged: false };
  const table = TABLES[logType as keyof typeof TABLES];
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("checkin_id", checkinId);
  if (error) return { ok: false };
  return { ok: true, logged: (count ?? 0) > 0 };
}
