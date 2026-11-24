/**
 * Spanish copy and error mapping of the time and Pomodoro-block actions. Pure (no server imports):
 * shared by the web server actions and the native app.
 */
export const INVALID_MINUTES = "El tiempo va de 1 minuto a 24 horas.";
export const INVALID_TOPIC = "El tema tiene hasta 60 caracteres.";
export const TIME_GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
export const TIME_NOT_AUTHENTICATED = "Inicia sesión para continuar.";
export const SIGN_IN_BLOCKS = "Inicia sesión para guardar tus bloques.";
export const TIME_UNAVAILABLE = "No pudimos conectar. Inténtalo de nuevo en unos minutos.";
export const BLOCK_EXPIRED = "Un bloque terminó ayer y ya no se puede sumar.";

export const TIME_ERRORS: Record<string, string> = {
  invalid_minutes: INVALID_MINUTES,
  minutes_over_day: "Un día tiene 24 horas: revisa el tiempo.",
  invalid_topic: INVALID_TOPIC,
  log_type_mismatch: "Este hábito ya no lleva tiempo.",
  habit_not_found: "Este hábito ya no está activo.",
  photo_required: "Este hábito pide foto: registra el tiempo después de subirla.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  checkin_not_found: "Ese día no tiene check-in.",
  invalid_block: "No pudimos guardar este bloque.",
  block_expired: BLOCK_EXPIRED,
  not_authenticated: TIME_NOT_AUTHENTICATED,
};

/** Codes that will never succeed on a retry. Everything else is retried (the RPC is idempotent). */
export const TIME_FINAL_CODES = [
  "habit_not_found",
  "log_type_mismatch",
  "photo_required",
  "habit_has_items",
  "minutes_over_day",
  "invalid_block",
  "invalid_minutes",
  "invalid_topic",
  "block_expired",
];

export function timeCodeOf(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/jwt|refresh token|not_authenticated|not authenticated|unauthori[sz]ed/i.test(raw)) return "not_authenticated";
  // a malformed block id fails the uuid cast: it can never be sent
  if (/invalid input syntax for type uuid/i.test(raw)) return "invalid_block";
  return Object.keys(TIME_ERRORS).find((k) => raw.includes(k)) ?? null;
}

export function timeMessageFor(raw: string | undefined): string {
  const code = timeCodeOf(raw);
  return code ? TIME_ERRORS[code] : TIME_GENERIC;
}

/** The text of a trimmed topic, or null when blank. */
export function cleanTopic(topic: string | null): string | null {
  const t = (topic ?? "").trim();
  return t === "" ? null : t;
}

/** The bounds the RPCs enforce, checked before any request: whole minutes from 1 to 24 hours, topic up to 60 characters. */
export function checkTimeInput(minutes: number, topic: string | null): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return { ok: false, error: INVALID_MINUTES };
  if (topic !== null && topic.length > 60) return { ok: false, error: INVALID_TOPIC };
  return { ok: true };
}
