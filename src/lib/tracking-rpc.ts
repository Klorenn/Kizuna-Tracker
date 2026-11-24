import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { GENERIC, messageFor, undoMessage } from "@/lib/tracking-copy";
import { undoCheckinCore, type UndoResult } from "@/lib/undo-checkin";

type Supabase = SupabaseClient<Database>;
type Fail = { ok: false; error: string };

export type CheckInResult = { ok: true; checkinId: string; created: boolean } | Fail;
export type CheckItemResult = { ok: true; created: boolean; dayCompleted: boolean } | Fail;

const FAILED: Fail = { ok: false, error: GENERIC };

/** Typed wrappers over the tracking RPCs, shared by the native app. Never throw: a failure is `{ok:false,error}` in Spanish. */
export async function checkInRpc(supabase: Supabase, habitId: string): Promise<CheckInResult> {
  try {
    const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
    const row = data?.[0];
    if (error || !row) return { ok: false, error: messageFor(error?.message) };
    return { ok: true, checkinId: row.checkin_id, created: row.created };
  } catch {
    return FAILED;
  }
}

export async function checkItemRpc(supabase: Supabase, itemId: string): Promise<CheckItemResult> {
  try {
    const { data, error } = await supabase.rpc("check_item", { p_item_id: itemId });
    const row = data?.[0];
    if (error || !row) return { ok: false, error: messageFor(error?.message) };
    return { ok: true, created: row.created, dayCompleted: row.day_completed };
  } catch {
    return FAILED;
  }
}

export async function uncheckItemRpc(supabase: Supabase, itemId: string): Promise<UndoResult> {
  try {
    const { error } = await supabase.rpc("uncheck_item", { p_item_id: itemId });
    if (error) return { ok: false, error: undoMessage(error.message) };
    return { ok: true };
  } catch {
    return FAILED;
  }
}

export async function undoCheckInRpc(supabase: Supabase, uid: string, habitId: string, now: Date = new Date()): Promise<UndoResult> {
  try {
    return await undoCheckinCore(supabase, uid, habitId, now);
  } catch {
    return FAILED;
  }
}
