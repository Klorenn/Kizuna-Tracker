/**
 * Spanish copy for tracking errors (check-in, steps, undo). Shared by the web server actions and
 * the native app: pure, no server imports.
 */
export const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
export const TODAY_LOCKED = "Hoy ya registraste este hábito. Cámbialo mañana o deshaz el registro de hoy.";

export const ERRORS: Record<string, string> = {
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
  date_locked: "Ayer ya se cerró. Se marca hasta el mediodía.",
  item_not_found: "No encontramos ese paso.",
  habit_not_found: "No encontramos ese hábito.",
  checkin_rejected: "Tu amigo rechazó esta prueba. No puedes deshacerla.",
  not_authenticated: "Inicia sesión para continuar.",
};

export const QUANTITY_IN_CHALLENGE =
  "Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.";
export const QUANTITY_SWITCH_IN_CHALLENGE =
  "Este hábito está en un reto. Cambia el tipo de registro cuando el reto termine.";
export const PHOTO_WITH_LOG = "Un hábito con foto no lleva tiempo ni cantidad.";
export const QUANTITY_UNDO = "Un hábito de cantidad se deshace quitando sumas.";
export const NOT_FOUND = ERRORS.habit_not_found;
export const CANNOT_UNDO = "No puedes deshacer este registro.";
export const NO_CHECKIN_TODAY = "Hoy no hay un registro que deshacer.";

export type MessageContext = {
  logType?: string;
  quantityInChallenge?: boolean;
  switchToQuantityInChallenge?: boolean;
};

/** `context` picks the copy of a code several rules share (photo_conflict, habit_in_challenge). */
export function messageFor(raw: string | undefined, context: MessageContext = {}): string {
  if (!raw) return GENERIC;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  if (key === "habit_in_challenge" && context.switchToQuantityInChallenge) return QUANTITY_SWITCH_IN_CHALLENGE;
  if (key === "habit_in_challenge" && context.quantityInChallenge) return QUANTITY_IN_CHALLENGE;
  if (key === "photo_conflict" && (context.logType === "time" || context.logType === "quantity")) {
    return PHOTO_WITH_LOG;
  }
  return key ? ERRORS[key] : GENERIC;
}

/** A failed undo: the quantity rule has its own copy here (the row offers no undo for them). */
export function undoMessage(raw: string | undefined): string {
  return raw?.includes("quantity_habit") || raw?.includes("quantity_checkin_managed") ? QUANTITY_UNDO : messageFor(raw);
}
