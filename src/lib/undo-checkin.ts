import type { SupabaseClient } from "@supabase/supabase-js";
import { checkinDateAllowed } from "@/domain/checkin-window";
import { addDays, localDate } from "@/domain/dates";
import type { Database } from "@/lib/supabase/database.types";
import {
  CANNOT_UNDO,
  ERRORS,
  GENERIC,
  NOT_FOUND,
  NO_CHECKIN_TODAY,
  undoMessage,
} from "@/lib/tracking-copy";

export type UndoResult = { ok: true } | { ok: false; error: string };

/**
 * Removes today's photo-less check-in (the date comes from the profile timezone). Shared by the web
 * action and the native app: the client is injected, nothing here touches cookies or the server.
 */
export async function undoCheckinCore(
  supabase: SupabaseClient<Database>,
  uid: string,
  habitId: string,
  now: Date = new Date(),
  when: "today" | "yesterday" = "today",
): Promise<UndoResult> {
  // ownership, time zone and steps do not depend on each other: one round, not three
  const [{ data: habit }, { data: profile }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("habits")
      .select("id,log_type,quantity_unit,visibility")
      .eq("id", habitId)
      .eq("user_id", uid)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", uid).maybeSingle(),
    supabase.from("habit_items").select("id").eq("habit_id", habitId).is("archived_at", null).limit(1),
  ]);
  if (!habit) return { ok: false, error: NOT_FOUND };
  if (!profile) return { ok: false, error: ERRORS.not_authenticated };
  const day = localDate(now, profile.timezone);
  const date = when === "yesterday" ? addDays(day, -1) : day;
  if (when === "yesterday" && !checkinDateAllowed(now, profile.timezone, date)) {
    return { ok: false, error: ERRORS.date_locked };
  }

  // habits with items are undone by unchecking an item; photo check-ins are not undoable here
  if (itemsError) return { ok: false, error: GENERIC };
  if (items && items.length > 0) return { ok: false, error: CANNOT_UNDO };
  const { data: today, error: todayError } = await supabase
    .from("checkins")
    .select("photo_path")
    .eq("habit_id", habitId)
    .eq("local_date", date)
    .maybeSingle();
  if (todayError) return { ok: false, error: GENERIC };
  if (today?.photo_path) return { ok: false, error: CANNOT_UNDO };

  const { data: removed, error } = await supabase
    .from("checkins")
    .delete()
    .eq("habit_id", habitId)
    .eq("local_date", date)
    .select("id");
  if (error) return { ok: false, error: undoMessage(error.message) };
  if (!removed || removed.length === 0) {
    return { ok: false, error: when === "yesterday" ? "Ayer no hay un registro que deshacer." : NO_CHECKIN_TODAY };
  }
  return { ok: true };
}
