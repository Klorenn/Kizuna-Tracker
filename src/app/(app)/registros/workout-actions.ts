"use server";

import { revalidatePath } from "next/cache";
import {
  MUSCLE_GROUPS,
  toSetsPayload,
  validateWorkoutDraft,
  type MuscleGroup,
  type WorkoutDraft,
} from "@/domain/logs";
import { requireUser } from "@/lib/require-user";
import {
  EXERCISE_NOT_FOUND,
  WORKOUT_GENERIC,
  validateExerciseName,
  workoutMessageFor,
} from "@/lib/workout-copy";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = WORKOUT_GENERIC;
const messageFor = workoutMessageFor;

function refresh() {
  revalidatePath("/");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/resumen");
}

export async function saveWorkout(checkinId: string, draft: WorkoutDraft): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const valid = validateWorkoutDraft(draft);
  if (!valid.ok) return valid;
  const { error } = await supabase.rpc("save_workout", {
    p_checkin_id: checkinId,
    p_day_types: draft.dayTypes,
    p_sets: toSetsPayload(draft),
  });
  if (error) return { ok: false, error: messageFor(error) };
  refresh();
  return { ok: true };
}

export async function deleteWorkout(checkinId: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.rpc("delete_workout", { p_checkin_id: checkinId });
  if (error) return { ok: false, error: messageFor(error) };
  refresh();
  return { ok: true };
}

export async function createExercise(input: {
  name: string;
  group: MuscleGroup;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  const name = validateExerciseName(input.name);
  if (!name.ok) return name;
  if (!MUSCLE_GROUPS.includes(input.group)) return { ok: false, error: "Elige un grupo muscular." };
  const { data, error } = await supabase
    .from("exercises")
    .insert({ user_id: uid, name: name.name, muscle_group: input.group })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error ? messageFor(error) : GENERIC };
  return { ok: true, id: data.id };
}

/** Updates one of the caller's own exercises; the catalog is never matched (user_id filter + RLS). */
async function updateOwnExercise(id: string, patch: { name: string } | { archived_at: string }): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  const { data, error } = await supabase
    .from("exercises")
    .update(patch)
    .eq("id", id)
    .eq("user_id", uid)
    .is("archived_at", null)
    .select("id");
  if (error) return { ok: false, error: messageFor(error) };
  if (!data || data.length === 0) return { ok: false, error: EXERCISE_NOT_FOUND };
  return { ok: true };
}

export async function renameExercise(id: string, name: string): Promise<Result> {
  const valid = validateExerciseName(name);
  if (!valid.ok) return valid;
  return updateOwnExercise(id, { name: valid.name });
}

export async function archiveExercise(id: string): Promise<Result> {
  return updateOwnExercise(id, { archived_at: new Date().toISOString() });
}
