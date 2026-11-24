"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/require-user";
import {
  INVALID_MINUTES,
  INVALID_TOPIC,
  SIGN_IN_BLOCKS,
  TIME_ERRORS,
  TIME_FINAL_CODES,
  TIME_GENERIC,
  TIME_UNAVAILABLE,
  cleanTopic,
  timeCodeOf,
  timeMessageFor,
} from "@/lib/time-copy";
import type { createServerClient } from "@/lib/supabase/server";

// Time logs and the Pomodoro block receipt. Every write goes through the 0018 RPCs; time never
// changes a streak, challenge or goal (it is the detail of a check-in).

type Result = { ok: true } | { ok: false; error: string };

// The generated RPC types say `string`, but a null topic means "no topic" in SQL: casts below.
const GENERIC = TIME_GENERIC;
const SIGN_IN_BLOCKS_COPY = SIGN_IN_BLOCKS;
const UNAVAILABLE = TIME_UNAVAILABLE;
const ERRORS = TIME_ERRORS;
const FINAL_CODES = TIME_FINAL_CODES;
const codeOf = timeCodeOf;
const messageFor = timeMessageFor;

function checkInput(minutes: number, topic: string | null): Result {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return { ok: false, error: INVALID_MINUTES };
  if (topic !== null && topic.length > 60) return { ok: false, error: INVALID_TOPIC };
  return { ok: true };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/resumen");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/habitos/[id]/tiempo", "page");
}

type Client = Awaited<ReturnType<typeof createServerClient>>;

/** The session check of every time action: the client, or the ready answer (sign in, or could not connect). */
async function authed() {
  return requireUser();
}

/** Like `authed`, but a failed check (network, server trouble) is its own answer for the block receipt. */
async function sessionCheck(): Promise<
  { state: "ok"; supabase: Client } | { state: "signed_out" } | { state: "unavailable" }
> {
  const auth = await requireUser();
  if (auth.ok) return { state: "ok", supabase: auth.supabase };
  return { state: auth.unavailable ? "unavailable" : "signed_out" };
}

/** Adds minutes to today's time for the habit. Creates the check-in when there was none (`checkedIn`). */
export async function addTime(
  habitId: string,
  minutes: number,
  topic: string | null,
): Promise<{ ok: true; totalMinutes: number; checkedIn: boolean } | { ok: false; error: string }> {
  const t = cleanTopic(topic);
  const valid = checkInput(minutes, t);
  if (!valid.ok) return valid;
  const auth = await authed();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("add_time", { p_habit_id: habitId, p_minutes: minutes, p_topic: t as string });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, totalMinutes: row.total_minutes, checkedIn: row.checkin_created };
}

/** "Solo marcar" in the time sheet: checks today in without any time. */
export async function checkInWithoutTime(habitId: string): Promise<Result> {
  const auth = await authed();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
  if (error || !data?.[0]) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true };
}

/** Fixes the total of a day with a check-in (edit mode, any day). Never touches the check-in. */
export async function setTimeEntry(checkinId: string, minutes: number, topic: string | null): Promise<Result> {
  const t = cleanTopic(topic);
  const valid = checkInput(minutes, t);
  if (!valid.ok) return valid;
  const auth = await authed();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.rpc("set_time_entry", { p_checkin_id: checkinId, p_minutes: minutes, p_topic: t as string });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteTimeEntry(checkinId: string): Promise<Result> {
  const auth = await authed();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.rpc("delete_time_entry", { p_checkin_id: checkinId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export type PomodoroSendResult =
  | { ok: true; credited: boolean; totalMinutes: number }
  | { ok: false; error: string; retry: boolean; code?: string };

/**
 * Sends one finished Pomodoro block. Idempotent by `blockId`: a retry answers ok with
 * `credited: false`, which the caller treats as success. Only the codes the RPC can never accept
 * (`FINAL_CODES`) are final (`retry: false`, with their `code`); everything else is retried, and a
 * lost session says so (`not_authenticated`). The RPC credits the day of the call and, given
 * `endedAt`, refuses a block that ended on an earlier day (`block_expired`).
 */
export async function sendPomodoroBlock(
  habitId: string,
  block: { blockId: string; minutes: number; endedAt: number },
  topic: string | null,
): Promise<PomodoroSendResult> {
  const t = cleanTopic(topic);
  // the end instant is required: the server needs it to refuse a block of an earlier day
  const ended = typeof block.endedAt === "number" ? new Date(block.endedAt) : null;
  if (ended === null || !Number.isFinite(ended.getTime())) {
    return { ok: false, error: ERRORS.invalid_block, retry: false, code: "invalid_block" };
  }
  if (!Number.isInteger(block.minutes) || block.minutes < 1 || block.minutes > 90) {
    return { ok: false, error: INVALID_MINUTES, retry: false, code: "invalid_minutes" };
  }
  if (t !== null && t.length > 60) return { ok: false, error: INVALID_TOPIC, retry: false, code: "invalid_topic" };
  try {
    const session = await sessionCheck();
    if (session.state === "unavailable") return { ok: false, error: UNAVAILABLE, retry: true, code: "session_unavailable" };
    if (session.state === "signed_out") return { ok: false, error: SIGN_IN_BLOCKS, retry: true, code: "not_authenticated" };
    const supabase = session.supabase;
    const { data, error } = await supabase.rpc("add_pomodoro_block", {
      p_habit_id: habitId,
      p_block_id: block.blockId,
      p_minutes: block.minutes,
      p_topic: t as string | undefined,
      // the server refuses a block that ended before today (block_expired)
      p_ended_at: ended.toISOString(),
    });
    const row = data?.[0];
    if (error || !row) {
      const code = codeOf(error?.message);
      if (code === "not_authenticated") return { ok: false, error: SIGN_IN_BLOCKS, retry: true, code };
      if (code !== null && FINAL_CODES.includes(code)) return { ok: false, error: ERRORS[code], retry: false, code };
      return { ok: false, error: GENERIC, retry: true };
    }
    if (row.credited) refresh();
    return { ok: true, credited: row.credited, totalMinutes: row.total_minutes };
  } catch {
    return { ok: false, error: GENERIC, retry: true };
  }
}
