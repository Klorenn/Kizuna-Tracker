import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  QUANTITY_ERRORS,
  QUANTITY_GENERIC,
  QUANTITY_MESSAGES,
  isQuantityNetwork,
  quantityMessageFor,
} from "@/lib/quantity-copy";
import { GENERIC, messageFor, undoMessage } from "@/lib/tracking-copy";
import {
  INVALID_MINUTES,
  INVALID_TOPIC,
  SIGN_IN_BLOCKS,
  TIME_ERRORS,
  TIME_FINAL_CODES,
  TIME_GENERIC,
  checkTimeInput,
  cleanTopic,
  timeCodeOf,
  timeMessageFor,
} from "@/lib/time-copy";
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

// ---- quantity ----

export type QuantityTotals = { total: number; target: number; done: boolean };
export type AddQuantityRpcResult = ({ ok: true } & QuantityTotals) | { ok: false; error: string; retry: boolean };
export type RemoveQuantityRpcResult = ({ ok: true } & QuantityTotals) | { ok: false; error: string };

function totalsOf(data: unknown): QuantityTotals | null {
  const row = (Array.isArray(data) ? data[0] : data) as { total: number | string; target: number | string; done: boolean } | null | undefined;
  if (!row) return null;
  const total = Number(row.total);
  const target = Number(row.target);
  return Number.isFinite(total) && Number.isFinite(target) ? { total, target, done: Boolean(row.done) } : null;
}

/** Adds one sum. Idempotent by `entryId`: `retry: true` means nothing was confirmed and the same call is safe to repeat. */
export async function addQuantityRpc(supabase: Supabase, habitId: string, entryId: string, amount: number): Promise<AddQuantityRpcResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: QUANTITY_ERRORS.invalid_amount, retry: false };
  try {
    const { data, error } = await supabase.rpc("add_quantity_entry", { p_habit_id: habitId, p_entry_id: entryId, p_amount: amount });
    if (error) {
      return isQuantityNetwork(error)
        ? { ok: false, error: QUANTITY_MESSAGES.offlineAdd, retry: true }
        : { ok: false, error: quantityMessageFor(error), retry: false };
    }
    const totals = totalsOf(data);
    return totals ? { ok: true, ...totals } : { ok: false, error: QUANTITY_GENERIC, retry: false };
  } catch {
    return { ok: false, error: QUANTITY_MESSAGES.offlineAdd, retry: true };
  }
}

export async function removeQuantityRpc(supabase: Supabase, entryId: string): Promise<RemoveQuantityRpcResult> {
  try {
    const { data, error } = await supabase.rpc("remove_quantity_entry", { p_entry_id: entryId });
    if (error) return { ok: false, error: isQuantityNetwork(error) ? QUANTITY_MESSAGES.offlineRemove : quantityMessageFor(error) };
    const totals = totalsOf(data);
    return totals ? { ok: true, ...totals } : { ok: false, error: QUANTITY_GENERIC };
  } catch {
    return { ok: false, error: QUANTITY_MESSAGES.offlineRemove };
  }
}

// ---- time and Pomodoro blocks ----

export type AddTimeResult = { ok: true; totalMinutes: number; checkedIn: boolean } | Fail;

export async function addTimeRpc(supabase: Supabase, habitId: string, minutes: number, topic: string | null): Promise<AddTimeResult> {
  const t = cleanTopic(topic);
  const valid = checkTimeInput(minutes, t);
  if (!valid.ok) return valid;
  try {
    // a null topic means "no topic" in SQL; the generated types say string
    const { data, error } = await supabase.rpc("add_time", { p_habit_id: habitId, p_minutes: minutes, p_topic: t as string });
    const row = data?.[0];
    if (error || !row) return { ok: false, error: timeMessageFor(error?.message) };
    return { ok: true, totalMinutes: row.total_minutes, checkedIn: row.checkin_created };
  } catch {
    return { ok: false, error: TIME_GENERIC };
  }
}

/** Fixes the total of a day with a check-in. Never touches the check-in. */
export async function setTimeEntryRpc(supabase: Supabase, checkinId: string, minutes: number, topic: string | null): Promise<UndoResult> {
  const t = cleanTopic(topic);
  const valid = checkTimeInput(minutes, t);
  if (!valid.ok) return valid;
  try {
    const { error } = await supabase.rpc("set_time_entry", { p_checkin_id: checkinId, p_minutes: minutes, p_topic: t as string });
    return error ? { ok: false, error: timeMessageFor(error.message) } : { ok: true };
  } catch {
    return { ok: false, error: TIME_GENERIC };
  }
}

export async function deleteTimeEntryRpc(supabase: Supabase, checkinId: string): Promise<UndoResult> {
  try {
    const { error } = await supabase.rpc("delete_time_entry", { p_checkin_id: checkinId });
    return error ? { ok: false, error: timeMessageFor(error.message) } : { ok: true };
  } catch {
    return { ok: false, error: TIME_GENERIC };
  }
}

export type PomodoroBlock = { blockId: string; minutes: number; endedAt: number };
export type PomodoroRpcResult =
  | { ok: true; credited: boolean; totalMinutes: number }
  | { ok: false; error: string; retry: boolean; code?: string };

/**
 * Credits one finished Pomodoro block. Idempotent by `blockId`: a repeat answers ok with `credited: false`. Only the codes
 * the RPC can never accept are final; the server refuses a block that ended on an earlier day (`block_expired`).
 */
export async function addPomodoroBlockRpc(
  supabase: Supabase,
  habitId: string,
  block: PomodoroBlock,
  topic: string | null,
): Promise<PomodoroRpcResult> {
  const t = cleanTopic(topic);
  const ended = typeof block.endedAt === "number" ? new Date(block.endedAt) : null;
  if (ended === null || !Number.isFinite(ended.getTime())) {
    return { ok: false, error: TIME_ERRORS.invalid_block, retry: false, code: "invalid_block" };
  }
  if (!Number.isInteger(block.minutes) || block.minutes < 1 || block.minutes > 90) {
    return { ok: false, error: INVALID_MINUTES, retry: false, code: "invalid_minutes" };
  }
  if (t !== null && t.length > 60) return { ok: false, error: INVALID_TOPIC, retry: false, code: "invalid_topic" };
  try {
    const { data, error } = await supabase.rpc("add_pomodoro_block", {
      p_habit_id: habitId,
      p_block_id: block.blockId,
      p_minutes: block.minutes,
      p_topic: t as string | undefined,
      p_ended_at: ended.toISOString(),
    });
    const row = data?.[0];
    if (error || !row) {
      const code = timeCodeOf(error?.message);
      if (code === "not_authenticated") return { ok: false, error: SIGN_IN_BLOCKS, retry: true, code };
      if (code !== null && TIME_FINAL_CODES.includes(code)) return { ok: false, error: TIME_ERRORS[code], retry: false, code };
      return { ok: false, error: TIME_GENERIC, retry: true };
    }
    return { ok: true, credited: row.credited, totalMinutes: row.total_minutes };
  } catch {
    return { ok: false, error: TIME_GENERIC, retry: true };
  }
}
