import { validateCardioInput, type CardioKind } from "@/domain/cardio";

/** Spanish copy and checks of the cardio actions. Pure: shared by the web server actions and the native app. */
export type CardioInput = {
  kind: CardioKind;
  distanceM: number;
  durationS: number;
  effort: number | null;
  note: string | null;
};

export const CARDIO_GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
export const CARDIO_OUTING_LOST = "Marcamos el hábito, pero no guardamos la salida. Inténtalo de nuevo.";
export const CARDIO_INVALID = "Revisa la distancia y el tiempo.";
export const CARDIO_MAX_NOTE = 60;

export const CARDIO_ERRORS: Record<string, string> = {
  invalid_cardio: CARDIO_INVALID,
  too_many_entries: "Puedes registrar hasta 10 salidas por día.",
  entry_not_found: "No encontramos esa salida.",
  checkin_not_found: "Ese día no tiene check-in.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  habit_not_found: "No encontramos ese hábito.",
  photo_required: "Este hábito pide una foto de prueba.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  not_authenticated: "Inicia sesión para continuar.",
};

export function cardioMessageFor(raw: string | undefined, fallback = CARDIO_GENERIC): string {
  if (!raw) return fallback;
  const key = Object.keys(CARDIO_ERRORS).find((k) => raw.includes(k));
  return key ? CARDIO_ERRORS[key] : fallback;
}

/** The checks the database repeats, so the sheet can answer before any round trip. */
export function checkCardio(entry: CardioInput): { ok: true; note: string | null } | { ok: false; error: string } {
  // a fractional amount is a format problem, not an out-of-range one: it gets its own copy
  if (Number.isFinite(entry.distanceM) && entry.distanceM > 0 && !Number.isInteger(entry.distanceM)) {
    return { ok: false, error: "La distancia debe ser un número entero de metros." };
  }
  if (Number.isFinite(entry.durationS) && entry.durationS > 0 && !Number.isInteger(entry.durationS)) {
    return { ok: false, error: "El tiempo debe ser un número entero de segundos." };
  }
  // 0 (or a non-number) means "nothing typed": the same copy as an empty field
  const valid = validateCardioInput({
    kind: entry.kind,
    distanceM: Number.isFinite(entry.distanceM) && entry.distanceM > 0 ? entry.distanceM : null,
    durationS: Number.isFinite(entry.durationS) && entry.durationS > 0 ? entry.durationS : null,
  });
  if (!valid.ok) return valid;
  if (entry.effort !== null && (!Number.isInteger(entry.effort) || entry.effort < 1 || entry.effort > 5)) {
    return { ok: false, error: CARDIO_INVALID };
  }
  const note = entry.note?.trim() ? entry.note.trim() : null;
  if (note !== null && note.length > CARDIO_MAX_NOTE) {
    return { ok: false, error: `La nota puede tener hasta ${CARDIO_MAX_NOTE} caracteres.` };
  }
  return { ok: true, note };
}

// effort and note are SQL defaults: PostgREST takes null, the generated types only say "omitted"
export function cardioFields(entry: CardioInput, note: string | null) {
  return {
    p_kind: entry.kind,
    p_distance_m: entry.distanceM,
    p_duration_s: entry.durationS,
    p_effort: entry.effort as number,
    p_note: note as string,
  };
}
