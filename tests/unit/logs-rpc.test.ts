import { describe, expect, it, vi } from "vitest";
import {
  addCardioRpc,
  checkInWithCardioRpc,
  checkInWithReadingRpc,
  checkInWithWatchRpc,
  createBookRpc,
  createExerciseRpc,
  createMediaRpc,
  deleteCardioRpc,
  deleteReadingRpc,
  deleteWatchRpc,
  deleteWorkoutRpc,
  loadExercisesRpc,
  loadMediaRpc,
  saveReadingRpc,
  saveWatchRpc,
  saveWorkoutRpc,
  updateCardioRpc,
} from "@/lib/logs-rpc";

type R = { data?: unknown; error?: { message?: string; code?: string } | null };
/** A fake client: `rpc` answers by function name; `from(table)` is a chain that resolves to the table's answer. */
function fake(rpcs: Record<string, R | (() => never)>, tables: Record<string, R> = {}) {
  const rpc = vi.fn(async (name: string) => {
    const r = rpcs[name];
    if (typeof r === "function") r();
    return { data: null, error: null, ...(r as R) };
  });
  const from = vi.fn((table: string) => {
    const answer = { data: null, error: null, ...(tables[table] ?? {}) };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "insert", "update", "delete", "eq", "or", "order", "limit", "in", "is"]) chain[m] = () => chain;
    chain.single = async () => answer;
    chain.maybeSingle = async () => answer;
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(answer).then(res);
    return chain;
  });
  return { rpc, from } as unknown as Parameters<typeof saveReadingRpc>[0] & { rpc: typeof rpc; from: typeof from };
}
const CHECKIN = { create_checkin: { data: [{ checkin_id: "c1", created: true }] } };
const reading = { bookId: "b1", fromPage: 1, toPage: 20, finished: false };

describe("reading", () => {
  it("checks in then saves, with the web args", async () => {
    const s = fake({ ...CHECKIN, save_reading_entry: {} });
    expect(await checkInWithReadingRpc(s, "h1", reading)).toEqual({ ok: true, checkinId: "c1", created: true });
    expect(s.rpc).toHaveBeenLastCalledWith("save_reading_entry", { p_checkin_id: "c1", p_book_id: "b1", p_from_page: 1, p_to_page: 20, p_finished: false });
  });
  it("only marks when there is no entry", async () => {
    const s = fake(CHECKIN);
    expect((await checkInWithReadingRpc(s, "h1", null)).ok).toBe(true);
    expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it("refuses bad pages before any request", async () => {
    const s = fake(CHECKIN);
    const r = await checkInWithReadingRpc(s, "h1", { ...reading, fromPage: 30, toPage: 5 });
    expect(r).toMatchObject({ ok: false, checkedIn: false });
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("keeps the habit checked when the reading fails, with the lost copy", async () => {
    const s = fake({ ...CHECKIN, save_reading_entry: { error: { message: "boom" } } });
    expect(await checkInWithReadingRpc(s, "h1", reading)).toEqual({
      ok: false,
      error: "Marcamos el hábito, pero no guardamos la lectura. Inténtalo de nuevo.",
      checkedIn: true,
    });
  });
  it("maps a check-in refusal and a thrown error", async () => {
    expect(await checkInWithReadingRpc(fake({ create_checkin: { error: { message: "habit_not_found" } } }), "h", reading)).toEqual({
      ok: false,
      error: "No encontramos ese hábito.",
      checkedIn: false,
    });
    const boom = fake({ create_checkin: () => { throw new Error("net"); } });
    expect(await checkInWithReadingRpc(boom, "h", reading)).toMatchObject({ ok: false, checkedIn: false });
  });
  it("save and delete on an existing check-in", async () => {
    expect(await saveReadingRpc(fake({ save_reading_entry: {} }), "c1", reading)).toEqual({ ok: true });
    expect(await saveReadingRpc(fake({ save_reading_entry: { error: { message: "book_not_found" } } }), "c1", reading)).toEqual({ ok: false, error: "No encontramos ese libro." });
    const d = fake({ delete_reading_entry: {} });
    expect(await deleteReadingRpc(d, "c1")).toEqual({ ok: true });
    expect(d.rpc).toHaveBeenCalledWith("delete_reading_entry", { p_checkin_id: "c1" });
  });
  it("creates a book with trimmed fields, validated first", async () => {
    const s = fake({}, { books: { data: { id: "bk" } } });
    expect(await createBookRpc(s, "u1", { title: " Dune ", author: null, totalPages: 400 })).toEqual({ ok: true, id: "bk" });
    expect((await createBookRpc(fake({}), "u1", { title: " ", author: null, totalPages: null })).ok).toBe(false);
  });
});

describe("cardio", () => {
  const e = { kind: "run", distanceM: 5000, durationS: 1800, effort: null, note: " tempo " } as const;
  it("checks in then adds the outing with the trimmed note", async () => {
    const s = fake({ ...CHECKIN, add_cardio_entry: { data: "e1" } });
    expect(await checkInWithCardioRpc(s, "h", e)).toEqual({ ok: true, checkinId: "c1", created: true });
    expect(s.rpc).toHaveBeenLastCalledWith("add_cardio_entry", { p_checkin_id: "c1", p_kind: "run", p_distance_m: 5000, p_duration_s: 1800, p_effort: null, p_note: "tempo" });
  });
  it("keeps the check-in when the outing fails", async () => {
    const s = fake({ ...CHECKIN, add_cardio_entry: { error: { message: "x" } } });
    expect(await checkInWithCardioRpc(s, "h", e)).toMatchObject({ ok: false, checkedIn: true, error: "Marcamos el hábito, pero no guardamos la salida. Inténtalo de nuevo." });
  });
  it("add, update, delete", async () => {
    expect(await addCardioRpc(fake({ add_cardio_entry: { data: "e1" } }), "c1", e)).toEqual({ ok: true, id: "e1" });
    expect(await addCardioRpc(fake({ add_cardio_entry: { error: { message: "too_many_entries" } } }), "c1", e)).toEqual({ ok: false, error: "Puedes registrar hasta 10 salidas por día." });
    const u = fake({ update_cardio_entry: {} });
    expect(await updateCardioRpc(u, "e1", e)).toEqual({ ok: true });
    expect(u.rpc).toHaveBeenCalledWith("update_cardio_entry", expect.objectContaining({ p_entry_id: "e1" }));
    expect(await deleteCardioRpc(fake({ delete_cardio_entry: { error: { message: "entry_not_found" } } }), "e1")).toEqual({ ok: false, error: "No encontramos esa salida." });
    expect((await addCardioRpc(fake({}), "c1", { ...e, distanceM: 0 })).ok).toBe(false);
  });
});

describe("watch", () => {
  const w = { mediaId: "m1", episodes: 2, season: 1, episodeTo: 2, minutes: null, completed: false, finished: false };
  const series = { media_items: { data: { id: "m1", title: "Dark", kind: "series", total_seasons: 3, total_episodes: 26, runtime_min: null } } };
  it("validates against the title, then checks in and saves", async () => {
    const s = fake({ ...CHECKIN, save_watch_entry: {} }, series);
    expect(await checkInWithWatchRpc(s, "h", w)).toEqual({ ok: true, checkinId: "c1", created: true });
    expect(s.rpc).toHaveBeenLastCalledWith("save_watch_entry", expect.objectContaining({ p_checkin_id: "c1", p_media_id: "m1", p_episodes: 2 }));
  });
  it("an unknown title is not found and nothing is sent", async () => {
    const s = fake(CHECKIN, { media_items: { data: null } });
    expect(await checkInWithWatchRpc(s, "h", w)).toEqual({ ok: false, error: "No encontramos ese título.", checkedIn: false });
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("a movie missing its data is refused by shape", async () => {
    const s = fake(CHECKIN, series);
    const r = await checkInWithWatchRpc(s, "h", { ...w, episodes: null, season: null, episodeTo: null });
    expect(r).toEqual({ ok: false, error: "Indica los minutos o marca que la viste completa.", checkedIn: false });
  });
  it("keeps the check-in when the entry fails", async () => {
    const s = fake({ ...CHECKIN, save_watch_entry: { error: { message: "x" } } }, series);
    expect(await checkInWithWatchRpc(s, "h", w)).toMatchObject({ ok: false, checkedIn: true, error: "Marcamos el hábito, pero no guardamos lo que viste. Inténtalo de nuevo." });
  });
  it("save and delete", async () => {
    expect(await saveWatchRpc(fake({ save_watch_entry: {} }, series), "c1", w)).toEqual({ ok: true });
    expect(await deleteWatchRpc(fake({ delete_watch_entry: {} }), "c1")).toEqual({ ok: true });
  });
  it("creates a title (validated) and lists them", async () => {
    expect(await createMediaRpc(fake({}, { media_items: { data: { id: "m9" } } }), "u1", { title: "Dark", kind: "series", totalSeasons: 3, totalEpisodes: 26, runtimeMin: null })).toEqual({ ok: true, id: "m9" });
    expect((await createMediaRpc(fake({}), "u1", { title: "", kind: "movie", totalSeasons: null, totalEpisodes: null, runtimeMin: null })).ok).toBe(false);
    const list = await loadMediaRpc(fake({}, { media_items: { data: [{ id: "m1", title: "Dark", kind: "series", total_seasons: 3, total_episodes: 26, runtime_min: null, status: "watching" }] } }), "u1");
    expect(list).toEqual([{ id: "m1", title: "Dark", kind: "series", totalSeasons: 3, totalEpisodes: 26, runtimeMin: null, status: "watching", finishedOn: null }]);
  });
});

describe("workout", () => {
  const draft = { dayTypes: ["legs" as const], exercises: [{ exerciseId: "x1", sets: [{ reps: 8, kg: 60 }] }] };
  it("saves with the sets payload", async () => {
    const s = fake({ save_workout: {} });
    expect(await saveWorkoutRpc(s, "c1", draft)).toEqual({ ok: true });
    expect(s.rpc).toHaveBeenCalledWith("save_workout", { p_checkin_id: "c1", p_day_types: ["legs"], p_sets: [{ exercise_id: "x1", reps: 8, kg: 60 }] });
  });
  it("refuses an invalid draft before any request and maps the RPC errors", async () => {
    const s = fake({});
    expect((await saveWorkoutRpc(s, "c1", { dayTypes: [], exercises: [] })).ok).toBe(false);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(await saveWorkoutRpc(fake({ save_workout: { error: { message: "too_many_sets" } } }), "c1", draft)).toEqual({ ok: false, error: "Revisa las series del entrenamiento." });
    expect(await deleteWorkoutRpc(fake({ delete_workout: { error: { message: "checkin_not_found" } } }), "c1")).toEqual({ ok: false, error: "Ese día no tiene check-in." });
  });
  it("creates an exercise (duplicate gets its copy) and lists them", async () => {
    expect(await createExerciseRpc(fake({}, { exercises: { data: { id: "x9" } } }), "u1", { name: " Remo ", group: "back" })).toEqual({ ok: true, id: "x9" });
    expect(await createExerciseRpc(fake({}, { exercises: { error: { code: "23505" } } }), "u1", { name: "Remo", group: "back" })).toEqual({ ok: false, error: "Ya tienes un ejercicio con ese nombre." });
    expect((await createExerciseRpc(fake({}), "u1", { name: " ", group: "back" })).ok).toBe(false);
    expect(await loadExercisesRpc(fake({}, { exercises: { data: [{ id: "x1", name: "Sentadilla", muscle_group: "legs" }] } }), "u1")).toEqual([{ id: "x1", name: "Sentadilla", group: "legs" }]);
  });
});
