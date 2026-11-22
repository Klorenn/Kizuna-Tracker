"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import { validateHabitDraft, type HabitDraft, type Visibility } from "@/domain/presets";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const ERRORS: Record<string, string> = {
  habit_in_challenge: "Este hábito tiene un reto activo. No puede ser solo tuyo.",
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

  const { error } = await supabase.from("habits").update(habitRow(draft)).eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };

  // Items are matched by label (case-insensitive): renaming archives the old step and
  // creates a new one, reordering only updates positions, so history is not mislabelled.
  const { data: current, error: readError } = await supabase
    .from("habit_items")
    .select("id,label")
    .eq("habit_id", id)
    .is("archived_at", null);
  if (readError) return { ok: false, error: GENERIC };
  const byLabel = new Map((current ?? []).map((i) => [i.label.trim().toLocaleLowerCase("es"), i.id]));
  const kept = new Set<string>();
  const inserts: {
    habit_id: string;
    user_id: string;
    label: string;
    position: number;
    requires_photo: boolean;
  }[] = [];
  for (const [position, item] of draft.items.entries()) {
    const label = item.label.trim();
    const existingId = byLabel.get(label.toLocaleLowerCase("es"));
    if (existingId) {
      kept.add(existingId);
      const { error: itemError } = await supabase
        .from("habit_items")
        .update({ label, position, requires_photo: item.requiresPhoto })
        .eq("id", existingId);
      if (itemError) return { ok: false, error: GENERIC };
    } else {
      inserts.push({ habit_id: id, user_id: uid, label, position, requires_photo: item.requiresPhoto });
    }
  }
  const dropped = (current ?? []).filter((i) => !kept.has(i.id)).map((i) => i.id);
  if (dropped.length > 0) {
    const { error: archiveError } = await supabase
      .from("habit_items")
      .update({ archived_at: new Date().toISOString() })
      .in("id", dropped);
    if (archiveError) return { ok: false, error: GENERIC };
  }
  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("habit_items").insert(inserts);
    if (insertError) return { ok: false, error: GENERIC };
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

export async function checkIn(habitId: string): Promise<{ checkinId: string; created: boolean }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
  const row = data?.[0];
  if (error || !row) throw new Error(messageFor(error?.message));
  refresh();
  return { checkinId: row.checkin_id, created: row.created };
}

/** Removes today's photo-less check-in (the date comes from the profile timezone). */
export async function undoCheckIn(habitId: string): Promise<void> {
  const supabase = await createServerClient();
  const { data: profile } = await supabase.from("profiles").select("timezone").single();
  if (!profile) throw new Error(ERRORS.not_authenticated);
  const { error } = await supabase
    .from("checkins")
    .delete()
    .eq("habit_id", habitId)
    .eq("local_date", localDate(new Date(), profile.timezone));
  if (error) throw new Error(GENERIC);
  refresh();
}

export async function checkItem(
  itemId: string,
): Promise<{ created: boolean; dayCompleted: boolean }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("check_item", { p_item_id: itemId });
  const row = data?.[0];
  if (error || !row) throw new Error(messageFor(error?.message));
  refresh();
  return { created: row.created, dayCompleted: row.day_completed };
}

export async function uncheckItem(itemId: string): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("uncheck_item", { p_item_id: itemId });
  if (error) throw new Error(messageFor(error.message));
  refresh();
}
