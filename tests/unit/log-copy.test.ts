import { describe, expect, it } from "vitest";
import { READING_ERRORS, READING_GENERIC, READING_LOST, checkReadingPages, readingMessageFor } from "@/lib/reading-copy";
import { CARDIO_ERRORS, CARDIO_GENERIC, CARDIO_INVALID, CARDIO_OUTING_LOST, checkCardio, cardioMessageFor } from "@/lib/cardio-copy";
import { MOVIE_NEEDS, WATCH_ERRORS, WATCH_GENERIC, WATCH_LOST, checkWatchShape, watchMessageFor } from "@/lib/watch-copy";
import { WORKOUT_DUPLICATE, WORKOUT_ERRORS, WORKOUT_GENERIC, validateExerciseName, workoutMessageFor } from "@/lib/workout-copy";

describe("reading copy", () => {
  it("maps codes, with a fallback", () => {
    expect(readingMessageFor("invalid_pages")).toBe("Revisa las páginas: la final no puede ser menor que la inicial.");
    expect(readingMessageFor("book_not_found")).toBe("No encontramos ese libro.");
    expect(readingMessageFor(undefined)).toBe(READING_GENERIC);
    expect(readingMessageFor("weird")).toBe(READING_GENERIC);
    expect(readingMessageFor("weird", READING_LOST)).toBe(READING_LOST);
    expect(READING_LOST).toBe("Marcamos el hábito, pero no guardamos la lectura. Inténtalo de nuevo.");
    for (const k of Object.keys(READING_ERRORS)) expect(READING_ERRORS[k]).toBeTruthy();
  });
  it("checks the pages before any request", () => {
    expect(checkReadingPages({ bookId: "b", fromPage: 10, toPage: 5, finished: false }).ok).toBe(false);
    expect(checkReadingPages({ bookId: "b", fromPage: 5, toPage: 10, finished: false })).toEqual({ ok: true });
  });
});

describe("cardio copy", () => {
  const ok = { kind: "run", distanceM: 5000, durationS: 1800, effort: null, note: null } as const;
  it("maps codes", () => {
    expect(cardioMessageFor("too_many_entries")).toBe("Puedes registrar hasta 10 salidas por día.");
    expect(cardioMessageFor(undefined)).toBe(CARDIO_GENERIC);
    expect(cardioMessageFor("weird", CARDIO_OUTING_LOST)).toBe(CARDIO_OUTING_LOST);
    expect(CARDIO_ERRORS.invalid_cardio).toBe(CARDIO_INVALID);
  });
  it("validates and trims the note", () => {
    expect(checkCardio({ ...ok, note: "  tempo  " })).toEqual({ ok: true, note: "tempo" });
    expect(checkCardio({ ...ok, note: "   " })).toEqual({ ok: true, note: null });
  });
  it("refuses fractional amounts, empty fields, bad effort and long notes", () => {
    expect(checkCardio({ ...ok, distanceM: 10.5 })).toEqual({ ok: false, error: "La distancia debe ser un número entero de metros." });
    expect(checkCardio({ ...ok, durationS: 9.5 })).toEqual({ ok: false, error: "El tiempo debe ser un número entero de segundos." });
    expect(checkCardio({ ...ok, distanceM: 0 }).ok).toBe(false);
    expect(checkCardio({ ...ok, effort: 6 })).toEqual({ ok: false, error: CARDIO_INVALID });
    expect(checkCardio({ ...ok, note: "x".repeat(61) })).toEqual({ ok: false, error: "La nota puede tener hasta 60 caracteres." });
  });
});

describe("watch copy", () => {
  it("maps codes", () => {
    expect(watchMessageFor("media_not_found")).toBe("No encontramos ese título.");
    expect(watchMessageFor(undefined)).toBe(WATCH_GENERIC);
    expect(watchMessageFor("weird", WATCH_LOST)).toBe(WATCH_LOST);
    for (const k of Object.keys(WATCH_ERRORS)) expect(WATCH_ERRORS[k]).toBeTruthy();
  });
  it("an entry with nothing is a movie missing its data", () => {
    const base = { mediaId: "m", episodes: null, season: null, episodeTo: null, minutes: null, completed: false, finished: false };
    expect(checkWatchShape(base)).toEqual({ ok: false, error: MOVIE_NEEDS });
    expect(checkWatchShape({ ...base, episodes: 2 })).toEqual({ ok: true });
    expect(checkWatchShape({ ...base, minutes: 90 })).toEqual({ ok: true });
    expect(checkWatchShape({ ...base, completed: true })).toEqual({ ok: true });
  });
});

describe("workout copy", () => {
  it("maps codes and the duplicate-name error code", () => {
    expect(workoutMessageFor({ message: "invalid_set" })).toBe("Revisa las series del entrenamiento.");
    expect(workoutMessageFor({ code: "23505" })).toBe(WORKOUT_DUPLICATE);
    expect(workoutMessageFor(undefined)).toBe(WORKOUT_GENERIC);
    expect(workoutMessageFor({ message: "weird" })).toBe(WORKOUT_GENERIC);
    for (const k of Object.keys(WORKOUT_ERRORS)) expect(WORKOUT_ERRORS[k]).toBeTruthy();
  });
  it("validates an exercise name", () => {
    expect(validateExerciseName("  Sentadilla ")).toEqual({ ok: true, name: "Sentadilla" });
    expect(validateExerciseName("  ")).toEqual({ ok: false, error: "Ponle un nombre al ejercicio." });
    expect(validateExerciseName("x".repeat(61))).toEqual({ ok: false, error: "El nombre puede tener hasta 60 caracteres." });
  });
});
