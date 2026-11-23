"use server";

import { revalidatePath } from "next/cache";
import { CARDIO_KINDS, validateCardioInput, type CardioKind } from "@/domain/cardio";
import { createServerClient } from "@/lib/supabase/server";

// Distance outings (cardio). Every write goes through the RPCs of 0018; none touches the check-in.

export type CardioInput = {
  kind: CardioKind;
  distanceM: number;
  durationS: number;
  effort: number | null;
  note: string | null;
};
type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const OUTING_LOST = "Marcamos el hábito, pero no guardamos la salida. Inténtalo de nuevo.";
const INVALID = "Revisa la distancia y el tiempo.";
const MAX_NOTE = 60;
const ERRORS: Record<string, string> = {
  invalid_cardio: INVALID,
  too_many_entries: "Puedes registrar hasta 10 salidas por día.",
  entry_not_found: "No encontramos esa salida.",
  checkin_not_found: "Ese día no tiene check-in.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  habit_not_found: "No encontramos ese hábito.",
  photo_required: "Este hábito pide una foto de prueba.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  not_authenticated: "Inicia sesión para continuar.",
};

function messageFor(raw: string | undefined, fallback = GENERIC): string {
  if (!raw) return fallback;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : fallback;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/resumen");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/habitos/[id]/distancia", "page");
}

/** The checks the database repeats, so the sheet can answer before any round trip. */
function check(entry: CardioInput): { ok: true; note: string | null } | { ok: false; error: string } {
  // 0 (or a non-number) means "nothing typed": the same copy as an empty field
  const valid = validateCardioInput({
    kind: entry.kind,
    distanceM: Number.isFinite(entry.distanceM) && entry.distanceM > 0 ? entry.distanceM : null,
    durationS: Number.isFinite(entry.durationS) && entry.durationS > 0 ? entry.durationS : null,
  });
  if (!valid.ok) return valid;
  if (entry.effort !== null && (!Number.isInteger(entry.effort) || entry.effort < 1 || entry.effort > 5)) {
    return { ok: false, error: INVALID };
  }
  const note = entry.note?.trim() ? entry.note.trim() : null;
  if (note !== null && note.length > MAX_NOTE) {
    return { ok: false, error: `La nota puede tener hasta ${MAX_NOTE} caracteres.` };
  }
  return { ok: true, note };
}

// effort and note are SQL defaults: PostgREST takes null, the generated types only say "omitted"
function fields(entry: CardioInput, note: string | null) {
  return {
    p_kind: entry.kind,
    p_distance_m: entry.distanceM,
    p_duration_s: entry.durationS,
    p_effort: entry.effort as number,
    p_note: note as string,
  };
}

/**
 * "Guardar" / "Omitir" in the sheet on Hoy: checks the habit in (create_checkin) and, with an
 * entry, adds the outing to that check-in. When the outing fails the habit stays checked in
 * (`checkedIn: true`) so the sheet can say so and retry with addCardio.
 */
export async function checkInWithCardio(
  habitId: string,
  entry: CardioInput | null,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string; checkedIn: boolean }> {
  const valid = entry ? check(entry) : null;
  if (valid && !valid.ok) return { ok: false, error: valid.error, checkedIn: false };
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message), checkedIn: false };
  if (entry && valid?.ok) {
    const { error: outingError } = await supabase.rpc("add_cardio_entry", {
      p_checkin_id: row.checkin_id,
      ...fields(entry, valid.note),
    });
    if (outingError) {
      refresh();
      return { ok: false, error: messageFor(outingError.message, OUTING_LOST), checkedIn: true };
    }
  }
  refresh();
  return { ok: true, checkinId: row.checkin_id, created: row.created };
}

/** Adds one more outing to an existing check-in ("+ Salida", any day with a check-in). */
export async function addCardio(
  checkinId: string,
  entry: CardioInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = check(entry);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("add_cardio_entry", { p_checkin_id: checkinId, ...fields(entry, valid.note) });
  if (error || !data) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, id: data };
}

export async function updateCardio(entryId: string, entry: CardioInput): Promise<Result> {
  const valid = check(entry);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("update_cardio_entry", { p_entry_id: entryId, ...fields(entry, valid.note) });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteCardio(entryId: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_cardio_entry", { p_entry_id: entryId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

/** The most recent outing of the habit, for "Repetir el último". */
export async function lastCardio(habitId: string): Promise<CardioInput | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("cardio_entries")
    .select("kind,distance_m,duration_s,effort,note")
    .eq("habit_id", habitId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !CARDIO_KINDS.includes(data.kind as CardioKind)) return null;
  return {
    kind: data.kind as CardioKind,
    distanceM: data.distance_m,
    durationS: data.duration_s,
    effort: data.effort,
    note: data.note,
  };
}
