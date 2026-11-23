"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

// Time logs and the Pomodoro block receipt. Every write goes through the 0018 RPCs; time never
// changes a streak, challenge or goal (it is the detail of a check-in).

type Result = { ok: true } | { ok: false; error: string };

// The generated RPC types say `string`, but a null topic means "no topic" in SQL: casts below.
const INVALID_MINUTES = "El tiempo va de 1 minuto a 24 horas.";
const INVALID_TOPIC = "El tema tiene hasta 60 caracteres.";
const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const NOT_AUTHENTICATED = "Inicia sesión para continuar.";
const ERRORS: Record<string, string> = {
  invalid_minutes: INVALID_MINUTES,
  minutes_over_day: "Un día tiene 24 horas: revisa el tiempo.",
  invalid_topic: INVALID_TOPIC,
  log_type_mismatch: "Este hábito ya no lleva tiempo.",
  habit_not_found: "Este hábito ya no está activo.",
  photo_required: "Este hábito pide foto: registra el tiempo después de subirla.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  checkin_not_found: "Ese día no tiene check-in.",
  invalid_block: "No pudimos guardar este bloque.",
  not_authenticated: NOT_AUTHENTICATED,
};

function messageFor(raw: string | undefined): string {
  if (!raw) return GENERIC;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : GENERIC;
}

/** Network failures and 5xx answers: the block is still good, so it stays pending. */
function isTransient(error: { message?: string } | null | undefined, status?: number): boolean {
  if (typeof status === "number" && status >= 500) return true;
  const raw = error?.message ?? "";
  // a lost session heals after signing in again: keep the block
  if (raw.includes("not_authenticated")) return true;
  if (Object.keys(ERRORS).some((k) => raw.includes(k))) return false;
  return /fetch|network|timeout|timed out|econn|socket|bad gateway|unavailable/i.test(raw);
}

function cleanTopic(topic: string | null): string | null {
  const t = (topic ?? "").trim();
  return t === "" ? null : t;
}

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

/** Adds minutes to today's time for the habit. Creates the check-in when there was none (`checkedIn`). */
export async function addTime(
  habitId: string,
  minutes: number,
  topic: string | null,
): Promise<{ ok: true; totalMinutes: number; checkedIn: boolean } | { ok: false; error: string }> {
  const t = cleanTopic(topic);
  const valid = checkInput(minutes, t);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("add_time", { p_habit_id: habitId, p_minutes: minutes, p_topic: t as string });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, totalMinutes: row.total_minutes, checkedIn: row.checkin_created };
}

/** "Omitir" in the time sheet: checks today in without any time. */
export async function checkInWithoutTime(habitId: string): Promise<Result> {
  const supabase = await createServerClient();
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
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_time_entry", { p_checkin_id: checkinId, p_minutes: minutes, p_topic: t as string });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteTimeEntry(checkinId: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_time_entry", { p_checkin_id: checkinId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

/**
 * Sends one finished Pomodoro block. Idempotent by `blockId`: a retry answers ok with
 * `credited: false`, which the caller treats as success. `retry` is true only for network or 5xx
 * errors (and a lost session); the codes of the spec are final.
 */
export async function sendPomodoroBlock(
  habitId: string,
  block: { blockId: string; minutes: number },
  topic: string | null,
): Promise<{ ok: true; credited: boolean; totalMinutes: number } | { ok: false; error: string; retry: boolean }> {
  try {
    const supabase = await createServerClient();
    const { data, error, status } = await supabase.rpc("add_pomodoro_block", {
      p_habit_id: habitId,
      p_block_id: block.blockId,
      p_minutes: block.minutes,
      p_topic: cleanTopic(topic) as string | undefined,
    });
    const row = data?.[0];
    if (error || !row) {
      return { ok: false, error: messageFor(error?.message), retry: error ? isTransient(error, status) : true };
    }
    if (row.credited) refresh();
    return { ok: true, credited: row.credited, totalMinutes: row.total_minutes };
  } catch {

    return { ok: false, error: GENERIC, retry: true };
  }
}
