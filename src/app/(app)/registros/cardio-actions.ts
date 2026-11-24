"use server";

import { revalidatePath } from "next/cache";
import { CARDIO_KINDS, type CardioKind } from "@/domain/cardio";
import {
  CARDIO_OUTING_LOST,
  cardioFields,
  cardioMessageFor,
  checkCardio,
  type CardioInput,
} from "@/lib/cardio-copy";
import { requireUser } from "@/lib/require-user";

// Distance outings (cardio). Every write goes through the RPCs of 0018; none touches the check-in.

type Result = { ok: true } | { ok: false; error: string };

const OUTING_LOST = CARDIO_OUTING_LOST;
const messageFor = cardioMessageFor;
const check = checkCardio;
const fields = cardioFields;

function refresh() {
  revalidatePath("/");
  revalidatePath("/resumen");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/habitos/[id]/distancia", "page");
}

/**
 * "Guardar" / "Solo marcar" in the sheet on Hoy: checks the habit in (create_checkin) and, with an
 * entry, adds the outing to that check-in. When the outing fails the habit stays checked in
 * (`checkedIn: true`) so the sheet can say so and retry with addCardio.
 */
export async function checkInWithCardio(
  habitId: string,
  entry: CardioInput | null,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string; checkedIn: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error, checkedIn: false };
  const { supabase } = auth;
  const valid = entry ? check(entry) : null;
  if (valid && !valid.ok) return { ok: false, error: valid.error, checkedIn: false };
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
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const valid = check(entry);
  if (!valid.ok) return valid;
  const { data, error } = await supabase.rpc("add_cardio_entry", { p_checkin_id: checkinId, ...fields(entry, valid.note) });
  if (error || !data) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, id: data };
}

export async function updateCardio(entryId: string, entry: CardioInput): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const valid = check(entry);
  if (!valid.ok) return valid;
  const { error } = await supabase.rpc("update_cardio_entry", { p_entry_id: entryId, ...fields(entry, valid.note) });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteCardio(entryId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.rpc("delete_cardio_entry", { p_entry_id: entryId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

/**
 * The most recent outing of the habit, for "Repetir el último". It degrades silently on purpose:
 * no session, a failed read or no outings all answer null and the sheet says "Aún no tienes salidas
 * para repetir." (a convenience read: nothing is lost, and a lost session shows up on the next save).
 */
export async function lastCardio(habitId: string): Promise<CardioInput | null> {
  const auth = await requireUser();
  if (!auth.ok) return null;
  const { supabase } = auth;
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
