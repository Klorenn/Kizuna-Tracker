"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import { validateHabitDraft, type HabitDraft, type Visibility } from "@/domain/presets";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const ERRORS: Record<string, string> = {
  habit_in_challenge: "Este hábito tiene un reto activo. No puede ser solo tuyo.",
  photo_conflict: "Un hábito con pasos pide la foto en cada paso, no en el hábito.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  photo_required: "Este hábito pide una foto de prueba.",
  item_not_found: "No encontramos ese paso.",
  habit_not_found: "No encontramos ese hábito.",
  checkin_rejected: "Tu amigo rechazó esta prueba. No puedes deshacerla.",
  not_authenticated: "Inicia sesión para continuar.",
};

function messageFor(raw: string | undefined): string {
  if (!raw) return GENERIC;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : GENERIC;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/habitos/[id]", "page");
}

function habitRow(draft: HabitDraft) {
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
  };
}

export async function createHabit(
  draft: HabitDraft,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = validateHabitDraft(draft);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: ERRORS.not_authenticated };

  const { data: habit, error } = await supabase
    .from("habits")
    .insert({ user_id: uid, ...habitRow(draft) })
    .select("id")
    .single();
  if (error || !habit) return { ok: false, error: GENERIC };

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

export async function updateHabit(id: string, draft: HabitDraft): Promise<Result> {
  const valid = validateHabitDraft(draft);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: ERRORS.not_authenticated };

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
  if (dropped.length > 0) {
    const { error: archiveError } = await supabase
      .from("habit_items")
      .update({ archived_at: new Date().toISOString() })
      .in("id", dropped);
    if (archiveError) return { ok: false, error: messageFor(archiveError.message) };
  }
  const { error } = await supabase.from("habits").update(habitRow(draft)).eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };

  for (const [position, item] of draft.items.entries()) {
    const label = item.label.trim();
    const existingId = byLabel.get(label.toLocaleLowerCase("es"));
    if (existingId) {
      const { error: itemError } = await supabase
        .from("habit_items")
        .update({ label, position, requires_photo: item.requiresPhoto })
        .eq("id", existingId);
      if (itemError) return { ok: false, error: messageFor(itemError.message) };
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
  if (!["private", "friends", "public"].includes(v)) return { ok: false, error: GENERIC };
  const supabase = await createServerClient();
  const { error } = await supabase.from("habits").update({ visibility: v }).eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function archiveHabit(id: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("habits")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function checkIn(
  habitId: string,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, checkinId: row.checkin_id, created: row.created };
}

const CANNOT_UNDO = "No puedes deshacer este registro.";

/** Removes today's photo-less check-in (the date comes from the profile timezone). */
export async function undoCheckIn(habitId: string): Promise<Result> {
  const supabase = await createServerClient();
  const { data: profile } = await supabase.from("profiles").select("timezone").single();
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

  const { error } = await supabase
    .from("checkins")
    .delete()
    .eq("habit_id", habitId)
    .eq("local_date", date);
  if (error) return { ok: false, error: GENERIC };
  refresh();
  return { ok: true };
}

export async function checkItem(
  itemId: string,
): Promise<{ ok: true; created: boolean; dayCompleted: boolean } | { ok: false; error: string }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("check_item", { p_item_id: itemId });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, created: row.created, dayCompleted: row.day_completed };
}

export async function uncheckItem(itemId: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("uncheck_item", { p_item_id: itemId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}
