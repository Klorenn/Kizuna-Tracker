"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import { validateBook, validateReadingInput, type BookInput } from "@/domain/logs";
import type { LocalDate } from "@/domain/types";
import { isLocalDate } from "@/lib/log-date";
import { createServerClient } from "@/lib/supabase/server";

// Reading and books. Workout actions live in ./workout-actions.ts (Gym area).

export type ReadingInput = { bookId: string; fromPage: number; toPage: number; finished: boolean };
type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos guardar los cambios. Inténtalo de nuevo.";
const READING_LOST = "Marcamos el hábito, pero no guardamos la lectura. Inténtalo de nuevo.";
const FUTURE = "La fecha no puede ser futura.";
const NOT_AUTHENTICATED = "Inicia sesión para continuar.";
const ERRORS: Record<string, string> = {
  invalid_pages: "Revisa las páginas: la final no puede ser menor que la inicial.",
  log_type_mismatch: "Este hábito no lleva ese tipo de registro.",
  checkin_not_found: "Ese día no tiene check-in.",
  book_not_found: "No encontramos ese libro.",
  invalid_finished_on: FUTURE,
  // same copy as habitos/actions.ts
  habit_not_found: "No encontramos ese hábito.",
  photo_required: "Este hábito pide una foto de prueba.",
  habit_has_items: "Este hábito se completa marcando sus pasos.",
  not_authenticated: NOT_AUTHENTICATED,
};

function messageFor(raw: string | undefined, fallback = GENERIC): string {
  if (!raw) return fallback;
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : fallback;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/libros");
  revalidatePath("/habitos/[id]", "page");
  revalidatePath("/habitos/[id]/lectura", "page");
}

/** Page checks the database repeats, so the sheet can answer before any round trip. */
function checkPages(entry: ReadingInput): Result {
  return validateReadingInput({ fromPage: entry.fromPage, toPage: entry.toPage, totalPages: null });
}

function readingArgs(checkinId: string, entry: ReadingInput) {
  return {
    p_checkin_id: checkinId,
    p_book_id: entry.bookId,
    p_from_page: entry.fromPage,
    p_to_page: entry.toPage,
    p_finished: entry.finished,
  };
}

/**
 * "Guardar" / "Solo marcar" in the reading sheet on Hoy: checks the habit in (create_checkin) and, with
 * an entry, saves the reading on that check-in. When the reading fails the habit stays checked
 * (`checkedIn: true`) so the sheet can say so and retry with saveReading.
 */
export async function checkInWithReading(
  habitId: string,
  entry: ReadingInput | null,
): Promise<{ ok: true; checkinId: string; created: boolean } | { ok: false; error: string; checkedIn: boolean }> {
  if (entry) {
    const valid = checkPages(entry);
    if (!valid.ok) return { ok: false, error: valid.error, checkedIn: false };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("create_checkin", { p_habit_id: habitId });
  const row = data?.[0];
  if (error || !row) return { ok: false, error: messageFor(error?.message), checkedIn: false };
  if (entry) {
    const { error: readingError } = await supabase.rpc("save_reading_entry", readingArgs(row.checkin_id, entry));
    if (readingError) {
      refresh();
      return { ok: false, error: messageFor(readingError.message, READING_LOST), checkedIn: true };
    }
  }
  refresh();
  return { ok: true, checkinId: row.checkin_id, created: row.created };
}

/** Adds or replaces the reading of an existing check-in (edit mode, any day). Never touches the check-in. */
export async function saveReading(checkinId: string, entry: ReadingInput): Promise<Result> {
  const valid = checkPages(entry);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("save_reading_entry", readingArgs(checkinId, entry));
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteReading(checkinId: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("delete_reading_entry", { p_checkin_id: checkinId });
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

function bookRow(input: BookInput) {
  return {
    title: input.title.trim(),
    author: input.author === null ? null : input.author.trim(),
    total_pages: input.totalPages,
  };
}

export async function createBook(input: BookInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = validateBook(input);
  if (!valid.ok) return valid;
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: NOT_AUTHENTICATED };
  const { data, error } = await supabase
    .from("books")
    .insert({ user_id: uid, ...bookRow(input) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: messageFor(error?.message) };
  refresh();
  return { ok: true, id: data.id };
}

export async function updateBook(id: string, input: BookInput): Promise<Result> {
  const valid = validateBook(input);
  if (!valid.ok) return valid;
  return updateOwnBook(id, bookRow(input));
}

/** Updates the caller's own book; a foreign or deleted id matches no row and is an error. */
async function updateOwnBook(id: string, fields: { total_pages: number | null; title?: string; author?: string | null }): Promise<Result> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return { ok: false, error: NOT_AUTHENTICATED };
  const { data, error } = await supabase.from("books").update(fields).eq("id", id).select("id");
  if (error) return { ok: false, error: messageFor(error.message) };
  if (!data || data.length === 0) return { ok: false, error: ERRORS.book_not_found };
  refresh();
  return { ok: true };
}

/**
 * "Añadir páginas totales" in the reading sheet: sets only `total_pages` (the sheet does not know
 * the author, and updateBook would overwrite it).
 */
export async function setBookTotalPages(id: string, totalPages: number): Promise<Result> {
  const valid = validateBook({ title: "x", author: null, totalPages });
  if (!valid.ok) return valid;
  return updateOwnBook(id, { total_pages: totalPages });
}

/** Finished on a local date (never after today in the profile's zone), or back to "reading" with null. */
export async function setBookFinished(id: string, finishedOn: LocalDate | null): Promise<Result> {
  const supabase = await createServerClient();
  if (finishedOn !== null) {
    if (!isLocalDate(finishedOn)) return { ok: false, error: "Elige una fecha válida." };
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return { ok: false, error: NOT_AUTHENTICATED };
    // own row only: friends' profiles are readable too, so never rely on .single() alone
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", uid).maybeSingle();
    if (!profile) return { ok: false, error: NOT_AUTHENTICATED };
    if (finishedOn > localDate(new Date(), profile.timezone)) return { ok: false, error: FUTURE };
  }
  const { error } = await supabase
    .from("books")
    .update({ status: finishedOn ? "finished" : "reading", finished_on: finishedOn })
    .eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}

/** Deletes the book; its readings go with it (cascade). Check-ins never change. */
export async function deleteBook(id: string): Promise<Result> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) return { ok: false, error: messageFor(error.message) };
  refresh();
  return { ok: true };
}
