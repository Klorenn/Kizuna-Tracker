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

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar el entrenamiento. Inténtalo de nuevo.";
const SETS = "Revisa las series del entrenamiento.";
const DUPLICATE = "Ya tienes un ejercicio con ese nombre.";
const NOT_AUTHENTICATED = "Inicia sesión para continuar.";
const EXERCISE_NOT_FOUND = "No encontramos ese ejercicio.";
const MAX_EXERCISE_NAME = 60;

const ERRORS: Record<string, string> = {
  checkin_not_found: "Ese día no tiene check-in.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  exercise_not_found: EXERCISE_NOT_FOUND,
  invalid_set: SETS,
  invalid_day_types: SETS,
  too_many_sets: SETS,
  too_many_exercises: "Puedes registrar hasta 20 ejercicios.",
  exercise_name_catalog: "Ese ejercicio ya está en el catálogo.",
  exercise_limit: "Puedes tener hasta 100 ejercicios propios. Archiva alguno para crear otro.",
  not_authenticated: NOT_AUTHENTICATED,
};

type DbError = { message?: string; code?: string } | null | undefined;

function messageFor(error: DbError): string {
  if (error?.code === "23505") return DUPLICATE;
  const raw = error?.message;
  if (!raw) return GENERIC;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : GENERIC;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/resumen");
}

function validateExerciseName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "Ponle un nombre al ejercicio." };
  if (name.length > MAX_EXERCISE_NAME) {
    return { ok: false, error: `El nombre puede tener hasta ${MAX_EXERCISE_NAME} caracteres.` };
  }
  return { ok: true, name };
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
