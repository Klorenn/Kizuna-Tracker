"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import { normalizeHabitDraft, validateHabitDraft, type HabitDraft, type Visibility } from "@/domain/presets";
import { draftExtraError } from "@/lib/habit-draft-checks";
import { requireUser } from "@/lib/require-user";
import type { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const TODAY_LOCKED = "Hoy ya registraste este hábito. Cámbialo mañana o deshaz el registro de hoy.";
const ERRORS: Record<string, string> = {
  habit_in_challenge: "Este hábito tiene un reto activo. No puede ser solo tuyo.",
  photo_conflict: "Un hábito con pasos pide la foto en cada paso, no en el hábito.",
  items_with_log: "Un hábito con pasos no lleva registro detallado.",
  period_closed: "Este día ya cerró en un reto: no puedes deshacerlo.",
  quantity_habit: "Este hábito se completa sumando cantidad desde Hoy.",
  // the database repeats the app-level lock on switching to or from quantity (or changing its unit)
  checkin_today: TODAY_LOCKED,
  quantity_checkin_managed: "Un hábito de cantidad se deshace quitando sumas.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  photo_required: "Este hábito pide una foto de prueba.",
  item_not_found: "No encontramos ese paso.",
  habit_not_found: "No encontramos ese hábito.",
  checkin_rejected: "Tu amigo rechazó esta prueba. No puedes deshacerla.",
  not_authenticated: "Inicia sesión para continuar.",
};

const QUANTITY_IN_CHALLENGE =
  "Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.";
const PHOTO_WITH_LOG = "Un hábito con foto no lleva tiempo ni cantidad.";
const QUANTITY_UNDO = "Un hábito de cantidad se deshace quitando sumas.";

/** `context` picks the copy of a code several rules share (photo_conflict, habit_in_challenge). */
function messageFor(raw: string | undefined, context: { logType?: string; quantityInChallenge?: boolean } = {}): string {
  if (!raw) return GENERIC;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  if (key === "habit_in_challenge" && context.quantityInChallenge) return QUANTITY_IN_CHALLENGE;
  if (key === "photo_conflict" && (context.logType === "time" || context.logType === "quantity")) {
    return PHOTO_WITH_LOG;
  }
  return key ? ERRORS[key] : GENERIC;
}

/** A failed undo: the quantity rule has its own copy here (the row offers no undo for them). */
function undoMessage(raw: string | undefined): string {
  return raw?.includes("quantity_habit") || raw?.includes("quantity_checkin_managed") ? QUANTITY_UNDO : messageFor(raw);
}

const NOT_FOUND = ERRORS.habit_not_found;

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/** The caller's own habit, or null (a foreign or missing id is "not found", never a silent success). */
async function ownHabit(supabase: Supabase, uid: string, id: string) {
  const { data } = await supabase
    .from("habits")
    .select("id,log_type,quantity_unit,visibility")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  return data ?? null;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/habitos/[id]", "page");
}

function habitRow(draft: HabitDraft) {
  const q = draft.quantity;
  return {
    name: draft.name.trim(),
    icon: draft.icon,
    frequency_type: draft.frequency.type,
    target_per_week: draft.frequency.type === "weekly" ? draft.frequency.target : null,
    requires_photo: draft.requiresPhoto,
    visibility: draft.visibility,
    preset: draft.preset,
    color: draft.color,
    // a habit with steps never carries a detailed log (validateHabitDraft refuses the mix)
    log_type: draft.logType,
    // the database pairs log_type 'quantity' with these columns; any other type carries none
    quantity_unit: q?.unit ?? null,
    quantity_label: q?.label?.trim() ?? null,
    quantity_target: q?.target ?? null,
    quantity_step: q?.step ?? null,
    ...(q ? { quantity_display: q.display, glass_ml: q.glassMl } : { quantity_display: "base", glass_ml: 250 }),
  };
}

export async function createHabit(
  input: HabitDraft,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  const draft = normalizeHabitDraft(input);
  const extra = draftExtraError(draft);
  if (extra) return { ok: false, error: extra };
  const valid = validateHabitDraft(draft);
  if (!valid.ok) return valid;

  const { data: habit, error } = await supabase
    .from("habits")
    .insert({ user_id: uid, ...habitRow(draft) })
    .select("id")
    .single();
  if (error || !habit) return { ok: false, error: messageFor(error?.message, { logType: draft.logType }) };

  if (draft.items.length > 0) {
    const { error: itemsError } = await supabase.from("habit_items").insert(
      draft.items.map((item, position) => ({
        habit_id: habit.id,
        user_id: uid,
        label: item.label.trim(),
        position,
        requires_photo: item.requiresPhoto,
      })),
    );
    if (itemsError) {
      await supabase.from("habits").delete().eq("id", habit.id);
      return { ok: false, error: GENERIC };
    }
  }
  refresh();
  return { ok: true, id: habit.id };
}

export async function updateHabit(id: string, input: HabitDraft): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  const draft = normalizeHabitDraft(input);
  const extra = draftExtraError(draft);
  if (extra) return { ok: false, error: extra };
  const valid = validateHabitDraft(draft);
  if (!valid.ok) return valid;
  const own = await ownHabit(supabase, uid, id);
  if (!own) return { ok: false, error: NOT_FOUND };

  // Switching to or from quantity (or changing its unit) with today already checked in would leave a
  // check-in no quantity sum backs, and a quantity check-in can only go away by removing sums.
  const wasQuantity = own.log_type === "quantity";
  const switches =
    (wasQuantity || draft.logType === "quantity") &&
    (wasQuantity !== (draft.logType === "quantity") || own.quantity_unit !== (draft.quantity?.unit ?? null));
  if (switches) {
    // a failed read must not let the change through: refuse with the generic retry copy
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", uid)
      .maybeSingle();
    if (profileError || !profile) return { ok: false, error: GENERIC };
    const { data: today, error: todayError } = await supabase
      .from("checkins")
      .select("id")
      .eq("habit_id", id)
      .eq("local_date", localDate(new Date(), profile.timezone))
      .maybeSingle();
    if (todayError) return { ok: false, error: GENERIC };
    if (today) return { ok: false, error: TODAY_LOCKED };
  }

  // Items are matched by label (case-insensitive): renaming archives the old step and
  // creates a new one, reordering only updates positions, so history is not mislabelled.
  const { data: current, error: readError } = await supabase
    .from("habit_items")
    .select("id,label")
    .eq("habit_id", id)
    .is("archived_at", null);
  if (readError) return { ok: false, error: GENERIC };
  const byLabel = new Map((current ?? []).map((i) => [i.label.trim().toLocaleLowerCase("es"), i.id]));
  const wanted = new Set(draft.items.map((i) => i.label.trim().toLocaleLowerCase("es")));
  const inserts: {
    habit_id: string;
    user_id: string;
    label: string;
    position: number;
    requires_photo: boolean;
  }[] = [];
  // archive dropped steps first so a habit can switch from steps to a photo requirement
  const dropped = (current ?? [])
    .filter((i) => !wanted.has(i.label.trim().toLocaleLowerCase("es")))
    .map((i) => i.id);
  // if the habit update is refused after the steps were archived, they come back: a failed save must
  // not leave a habit whose day now completes with one tap
  const restoreDropped = async () => {
    if (dropped.length > 0) await supabase.from("habit_items").update({ archived_at: null }).in("id", dropped);
  };
  if (dropped.length > 0) {
    const { error: archiveError } = await supabase
      .from("habit_items")
      .update({ archived_at: new Date().toISOString() })
      .in("id", dropped);
    if (archiveError) {
      await restoreDropped();
      return { ok: false, error: messageFor(archiveError.message, { logType: draft.logType }) };
    }
  }
  const { data: updated, error } = await supabase
    .from("habits")
    .update(habitRow(draft))
    .eq("id", id)
    .eq("user_id", uid)
    .select("id");
  if (!error && (!updated || updated.length === 0)) {
    await restoreDropped();
    return { ok: false, error: NOT_FOUND };
  }
  if (error) {
    await restoreDropped();
    // habit_in_challenge also guards visibility and photos: tell which rule a quantity habit broke
    const quantityInChallenge =
      error.message?.includes("habit_in_challenge") &&
      own.log_type === "quantity" &&
      !(draft.visibility === "private" && own.visibility !== "private");
    return { ok: false, error: messageFor(error.message, { logType: draft.logType, quantityInChallenge }) };
  }

  for (const [position, item] of draft.items.entries()) {
    const label = item.label.trim();
    const existingId = byLabel.get(label.toLocaleLowerCase("es"));
    if (existingId) {
      const { data: kept, error: itemError } = await supabase
        .from("habit_items")
        .update({ label, position, requires_photo: item.requiresPhoto })
        .eq("id", existingId)
        .select("id");
      if (itemError) return { ok: false, error: messageFor(itemError.message) };
      if (!kept || kept.length === 0) return { ok: false, error: GENERIC };
    } else {
      inserts.push({ habit_id: id, user_id: uid, label, position, requires_photo: item.requiresPhoto });
    }
  }
  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("habit_items").insert(inserts);
    if (insertError) return { ok: false, error: messageFor(insertError.message) };
  }
  refresh();
  return { ok: true };
}

export async function setHabitVisibility(id: string, v: Visibility): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  if (!["private", "friends", "public"].includes(v)) return { ok: false, error: GENERIC };
  if (!(await ownHabit(supabase, uid, id))) return { ok: false, error: NOT_FOUND };
  const { data, error } = await supabase
    .from("habits")
    .update({ visibility: v })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id");
  if (error) return { ok: false, error: messageFor(error.message) };
  if (!data || data.length === 0) return { ok: false, error: NOT_FOUND };
  refresh();
  return { ok: true };
}

export async function archiveHabit(id: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  if (!(await ownHabit(supabase, uid, id))) return { ok: false, error: NOT_FOUND };
  const { data, error } = await supabase
    .from("habits")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id");
  if (error) return { ok: false, error: messageFor(error.message) };
  if (!data || data.length === 0) return { ok: false, error: NOT_FOUND };
  refresh();
  return { ok: true };
}

export async function checkIn(
  habitId: string,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase.rpc("create_checkin", { p_habit_id: habitId });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, checkinId: row.checkin_id, created: row.created };
}

const CANNOT_UNDO = "No puedes deshacer este registro.";
const NO_CHECKIN_TODAY = "Hoy no hay un registro que deshacer.";

/** Removes today's photo-less check-in (the date comes from the profile timezone). */
export async function undoCheckIn(habitId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  if (!(await ownHabit(supabase, uid, habitId))) return { ok: false, error: NOT_FOUND };
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", uid).maybeSingle();
  if (!profile) return { ok: false, error: ERRORS.not_authenticated };
  const date = localDate(new Date(), profile.timezone);

  // habits with items are undone by unchecking an item; photo check-ins are not undoable here
  const { data: items } = await supabase
    .from("habit_items")
    .select("id")
    .eq("habit_id", habitId)
    .is("archived_at", null)
    .limit(1);
  if (items && items.length > 0) return { ok: false, error: CANNOT_UNDO };
  const { data: today } = await supabase
    .from("checkins")
    .select("photo_path")
    .eq("habit_id", habitId)
    .eq("local_date", date)
    .maybeSingle();
  if (today?.photo_path) return { ok: false, error: CANNOT_UNDO };

  const { data: removed, error } = await supabase
    .from("checkins")
    .delete()
    .eq("habit_id", habitId)
    .eq("local_date", date)
    .select("id");
  if (error) return { ok: false, error: undoMessage(error.message) };
  if (!removed || removed.length === 0) return { ok: false, error: NO_CHECKIN_TODAY };
  refresh();
  return { ok: true };
}

export async function checkItem(
  itemId: string,
): Promise<{ ok: true; created: boolean; dayCompleted: boolean } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase.rpc("check_item", { p_item_id: itemId });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, created: row.created, dayCompleted: row.day_completed };
}

export async function uncheckItem(itemId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await auth.supabase.rpc("uncheck_item", { p_item_id: itemId });
  if (error) return { ok: false, error: undoMessage(error.message) };
  refresh();
  return { ok: true };
}
