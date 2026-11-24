import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildToday, type TodayRow } from "@/domain/today";
import type { Database } from "@/lib/supabase/database.types";
import { loadTodayCore, type TodayData } from "@/lib/today-core";

type Ready = Extract<TodayData, { ok: true }>;

/** What the query caches: `TodayData` without the Map, so it persists as JSON. */
export type TodayRaw = Omit<Ready, "groupChips" | "ok"> & { ok?: true; groupChips: [string, { name: string; color: string }][] };

export type TodayView = {
  label: string;
  /** the local date (user zone) the view is for, and that zone: taps capture them for the replay rule */
  today: string;
  timeZone: string;
  rows: TodayRow[];
  doneCount: number;
  total: number;
  bestDailyStreak: number;
  /** done over total, 0 when there are no habits */
  progress: number;
};

export class TodayLoadError extends Error {
  constructor(readonly missingProfile: boolean) {
    super(missingProfile ? "profile missing" : "today read failed");
  }
}

export function todayRawOf(data: Ready): TodayRaw {
  const { groupChips, ...rest } = data;
  return { ...rest, groupChips: [...groupChips.entries()] };
}

/**
 * Group chips need `groups-data` (server-only) for the row mapping, which is not whitelisted: Phase 1 shows no chips
 * (an empty Map), as the design allows. M1+ can extract the mapper to a whitelisted file.
 */
const noChips = async () => new Map<string, { name: string; color: string }>();

/** The queryFn: the shared reads, over the user's own session (RLS), as a persistable value. */
export async function fetchToday(supabase: SupabaseClient<Database>, userId: string, now: Date = new Date()): Promise<TodayRaw> {
  const profileRead = Promise.resolve(supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle()).then(({ data, error }) => {
    if (error) throw new TodayLoadError(false);
    return data;
  });
  const data = await loadTodayCore(supabase, userId, profileRead, now, noChips);
  if (!data.ok) throw new TodayLoadError(Boolean(data.missingProfile));
  return todayRawOf(data);
}

/** The queryFn result to what the screen draws: the same `buildToday` as the web page. */
export function selectToday(raw: TodayRaw, now: Date = new Date()): TodayView {
  const built = buildToday({
    habits: raw.habits,
    items: raw.items,
    checkins: raw.checkins,
    itemChecks: raw.itemChecks,
    logs: raw.todayLogs.logs,
    quantity: raw.todayLogs.quantity,
    today: raw.today,
    timeZone: raw.timeZone,
  });
  return {
    today: raw.today,
    timeZone: raw.timeZone,
    label: `Hoy · ${format(new TZDate(now, raw.timeZone), "EEE d MMM", { locale: es })}`,
    rows: built.rows,
    doneCount: built.doneCount,
    total: built.total,
    bestDailyStreak: built.bestDailyStreak,
    progress: built.total === 0 ? 0 : built.doneCount / built.total,
  };
}
