import { validateReadingInput } from "@/domain/logs";

/**
 * Spanish copy and checks of the reading actions. Pure (no server imports): shared by the web server
 * actions and the native app.
 */
export type ReadingInput = { bookId: string; fromPage: number; toPage: number; finished: boolean };

export const READING_GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
export const READING_LOST = "Marcamos el hábito, pero no guardamos la lectura. Inténtalo de nuevo.";
export const READING_FUTURE = "La fecha no puede ser futura.";
export const READING_NOT_AUTHENTICATED = "Inicia sesión para continuar.";

export const READING_ERRORS: Record<string, string> = {
  invalid_pages: "Revisa las páginas: la final no puede ser menor que la inicial.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  checkin_not_found: "Ese día no tiene check-in.",
  book_not_found: "No encontramos ese libro.",
  invalid_finished_on: READING_FUTURE,
  // same copy as habitos/actions.ts
  habit_not_found: "No encontramos ese hábito.",
  photo_required: "Este hábito pide una foto de prueba.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  not_authenticated: READING_NOT_AUTHENTICATED,
};

export function readingMessageFor(raw: string | undefined, fallback = READING_GENERIC): string {
  if (!raw) return fallback;
  const key = Object.keys(READING_ERRORS).find((k) => raw.includes(k));
  return key ? READING_ERRORS[key] : fallback;
}

/** Page checks the database repeats, so the sheet can answer before any round trip. */
export function checkReadingPages(entry: ReadingInput): { ok: true } | { ok: false; error: string } {
  return validateReadingInput({ fromPage: entry.fromPage, toPage: entry.toPage, totalPages: null });
}

export function readingArgs(checkinId: string, entry: ReadingInput) {
  return {
    p_checkin_id: checkinId,
    p_book_id: entry.bookId,
    p_from_page: entry.fromPage,
    p_to_page: entry.toPage,
    p_finished: entry.finished,
  };
}
