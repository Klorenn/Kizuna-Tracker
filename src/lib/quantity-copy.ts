/**
 * Spanish copy and error mapping of the quantity actions. Pure (no server imports): shared by the web
 * server actions and the native app.
 */

/** Copy shared by the actions and the controls. */
export const QUANTITY_MESSAGES = {
  offlineAdd: "Sin conexión. Guardaremos la suma cuando vuelvas a estar en línea.",
  offlineRemove: "Sin conexión. No pudimos quitar la suma.",
  /** A tap from an earlier local day is never credited to a later one (same rule as Pomodoro blocks). */
  staleDay: "Una suma de ayer no se guardó.",
  notFound: "No encontramos esa suma.",
} as const;

export const QUANTITY_GENERIC = "No pudimos guardar la cantidad. Inténtalo de nuevo.";

export const QUANTITY_ERRORS: Record<string, string> = {
  invalid_amount: "Revisa la cantidad.",
  amount_over_day: "Es demasiado para un día.",
  entry_not_today: "Solo puedes quitar lo de hoy.",
  entry_not_found: QUANTITY_MESSAGES.notFound,
  invalid_entry: "No pudimos guardar esa suma.",
  habit_not_found: "No encontramos ese hábito.",
  log_type_mismatch: "Este hábito ya no es de cantidad.",
  habit_in_challenge: "Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.",
  not_authenticated: "Inicia sesión para continuar.",
};

const NETWORK = /fetch|network|failed to fetch|econn|timeout|load failed/i;

export type QuantityDbError = { message?: string; code?: string } | null | undefined;

/** A transport failure (nothing was confirmed), not a coded refusal. */
export function isQuantityNetwork(error: QuantityDbError): boolean {
  const raw = error?.message ?? "";
  return !Object.keys(QUANTITY_ERRORS).some((k) => raw.includes(k)) && NETWORK.test(raw);
}

export function quantityMessageFor(error: QuantityDbError): string {
  const raw = error?.message ?? "";
  const key = Object.keys(QUANTITY_ERRORS).find((k) => raw.includes(k));
  return key ? QUANTITY_ERRORS[key] : QUANTITY_GENERIC;
}
