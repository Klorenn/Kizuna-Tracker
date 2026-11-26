"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import { normalizeHabitDraft, validateHabitDraft, type HabitDraft, type Visibility } from "@/domain/presets";
import { draftExtraError } from "@/lib/habit-draft-checks";
import { requireUser } from "@/lib/require-user";
import { GENERIC, NOT_FOUND, TODAY_LOCKED, messageFor, undoMessage } from "@/lib/tracking-copy";
import { undoCheckinCore } from "@/lib/undo-checkin";
import type { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };


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

/** A check-in or undo changes Hoy and that one habit's page: Hoy once, no other habit page. */
function refreshHabit(habitId: string) {
  revalidatePath("/");
  revalidatePath(`/habitos/${habitId}`);
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
  // returns the copy to show when the restore itself fails (then the steps are still archived)
  const restoreDropped = async (): Promise<string | null> => {
    if (dropped.length === 0) return null;
    const { error: restoreError } = await supabase.from("habit_items").update({ archived_at: null }).in("id", dropped);
    return restoreError ? GENERIC : null;
  };
  if (dropped.length > 0) {
    const { error: archiveError } = await supabase
      .from("habit_items")
      .update({ archived_at: new Date().toISOString() })
      .in("id", dropped);
    if (archiveError) {
      const restoreFailed = await restoreDropped();
      return { ok: false, error: restoreFailed ?? messageFor(archiveError.message, { logType: draft.logType }) };
    }
  }
  const { data: updated, error } = await supabase
    .from("habits")
    .update(habitRow(draft))
    .eq("id", id)
    .eq("user_id", uid)
    .select("id");
  if (!error && (!updated || updated.length === 0)) {
    return { ok: false, error: (await restoreDropped()) ?? NOT_FOUND };
  }
  if (error) {
    const restoreFailed = await restoreDropped();
    // habit_in_challenge also guards visibility and photos: tell which rule a quantity habit broke
    const quantityInChallenge =
      error.message?.includes("habit_in_challenge") &&
      own.log_type === "quantity" &&
      !(draft.visibility === "private" && own.visibility !== "private");
    // a log type switch while in a challenge is refused too (to quantity, or with a photo challenge):
    // it is not about visibility either
    const switchToQuantityInChallenge =
      error.message?.includes("habit_in_challenge") && draft.logType !== own.log_type;
    return {
      ok: false,
      error:
        restoreFailed ??
        messageFor(error.message, { logType: draft.logType, quantityInChallenge, switchToQuantityInChallenge }),
    };
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

export async function restoreHabit(id: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  if (!(await ownHabit(supabase, uid, id))) return { ok: false, error: NOT_FOUND };
  const { data, error } = await supabase
    .from("habits")
    .update({ archived_at: null })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id");
  if (error) return { ok: false, error: messageFor(error.message) };
  if (!data || data.length === 0) return { ok: false, error: NOT_FOUND };
  refresh();
  revalidatePath("/habitos/archivados");
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
  refreshHabit(habitId);
  return { ok: true, checkinId: row.checkin_id, created: row.created };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A boolean check-in on a chosen day. The database allows today, and yesterday before local noon. */
export async function checkInOn(
  habitId: string,
  date: string,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!DAY.test(date)) return { ok: false, error: GENERIC };
  const { data, error } = await auth.supabase.rpc("create_checkin_on", { p_habit_id: habitId, p_date: date });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message) };
  refreshHabit(habitId);
  revalidatePath("/resumen");
  return { ok: true, checkinId: row.checkin_id, created: row.created };
}

/** Removes today's photo-less check-in (the date comes from the profile timezone). */
export async function undoCheckIn(habitId: string, when: "today" | "yesterday" = "today"): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const result = await undoCheckinCore(auth.supabase, auth.userId, habitId, new Date(), when);
  if (result.ok) {
    refreshHabit(habitId);
    if (when === "yesterday") revalidatePath("/resumen");
  }
  return result;
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
