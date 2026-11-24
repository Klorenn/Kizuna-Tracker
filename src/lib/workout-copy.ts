/** Spanish copy of the workout actions. Pure: shared by the web server actions and the native app. */
export const WORKOUT_GENERIC = "No pudimos guardar el entrenamiento. Inténtalo de nuevo.";
export const WORKOUT_SETS = "Revisa las series del entrenamiento.";
export const WORKOUT_DUPLICATE = "Ya tienes un ejercicio con ese nombre.";
export const WORKOUT_NOT_AUTHENTICATED = "Inicia sesión para continuar.";
export const EXERCISE_NOT_FOUND = "No encontramos ese ejercicio.";
export const MAX_EXERCISE_NAME = 60;

export const WORKOUT_ERRORS: Record<string, string> = {
  checkin_not_found: "Ese día no tiene check-in.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  exercise_not_found: EXERCISE_NOT_FOUND,
  invalid_set: WORKOUT_SETS,
  invalid_day_types: WORKOUT_SETS,
  too_many_sets: WORKOUT_SETS,
  too_many_exercises: "Puedes registrar hasta 20 ejercicios.",
  exercise_name_catalog: "Ese ejercicio ya está en el catálogo.",
  exercise_limit: "Puedes tener hasta 100 ejercicios propios. Archiva alguno para crear otro.",
  not_authenticated: WORKOUT_NOT_AUTHENTICATED,
};

type DbError = { message?: string; code?: string } | null | undefined;

export function workoutMessageFor(error: DbError): string {
  if (error?.code === "23505") return WORKOUT_DUPLICATE;
  const raw = error?.message;
  if (!raw) return WORKOUT_GENERIC;
  const key = Object.keys(WORKOUT_ERRORS).find((k) => raw.includes(k));
  return key ? WORKOUT_ERRORS[key] : WORKOUT_GENERIC;
}

export function validateExerciseName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "Ponle un nombre al ejercicio." };
  if (name.length > MAX_EXERCISE_NAME) {
    return { ok: false, error: `El nombre puede tener hasta ${MAX_EXERCISE_NAME} caracteres.` };
  }
  return { ok: true, name };
}
