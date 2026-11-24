import { makeLogActions } from "./log-actions";

jest.mock("@/lib/logs-rpc", () => ({
  checkInWithReadingRpc: jest.fn(),
  saveReadingRpc: jest.fn(),
  deleteReadingRpc: jest.fn(),
  createBookRpc: jest.fn(),
  checkInWithCardioRpc: jest.fn(),
  addCardioRpc: jest.fn(),
  updateCardioRpc: jest.fn(),
  deleteCardioRpc: jest.fn(),
  checkInWithWatchRpc: jest.fn(),
  saveWatchRpc: jest.fn(),
  deleteWatchRpc: jest.fn(),
  createMediaRpc: jest.fn(),
  saveWorkoutRpc: jest.fn(),
  deleteWorkoutRpc: jest.fn(),
  createExerciseRpc: jest.fn(),
}));
jest.mock("@/lib/tracking-rpc", () => ({ checkInRpc: jest.fn() }));

const rpc = jest.requireMock("@/lib/logs-rpc") as Record<string, jest.Mock>;
const track = jest.requireMock("@/lib/tracking-rpc") as { checkInRpc: jest.Mock };
const client = {} as never;
const ok = { ok: true };
const reading = { bookId: "b", fromPage: 1, toPage: 9, finished: false };
const make = (checkinId: string | null) => {
  const refresh = jest.fn();
  return { refresh, a: makeLogActions({ client: () => client, userId: "u1", habitId: "h1", checkinId: () => checkinId, refresh }) };
};
beforeEach(() => jest.resetAllMocks());

describe("log actions: reading", () => {
  it("with no check-in today, checks in and saves in one go, then refreshes Hoy", async () => {
    rpc.checkInWithReadingRpc.mockResolvedValue({ ok: true, checkinId: "c", created: true });
    const { a, refresh } = make(null);
    expect(await a.reading.onSave(reading)).toEqual(ok);
    expect(rpc.checkInWithReadingRpc).toHaveBeenCalledWith(client, "h1", reading);
    expect(refresh).toHaveBeenCalled();
  });
  it("with today's check-in, saves on it without checking in again", async () => {
    rpc.saveReadingRpc.mockResolvedValue(ok);
    const { a, refresh } = make("c9");
    expect(await a.reading.onSave(reading)).toEqual(ok);
    expect(rpc.saveReadingRpc).toHaveBeenCalledWith(client, "c9", reading);
    expect(rpc.checkInWithReadingRpc).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });
  it("when the reading is lost but the habit got checked, it says so and still refreshes", async () => {
    rpc.checkInWithReadingRpc.mockResolvedValue({ ok: false, error: "lost", checkedIn: true });
    const { a, refresh } = make(null);
    expect(await a.reading.onSave(reading)).toEqual({ ok: false, error: "lost" });
    expect(refresh).toHaveBeenCalled();
  });
  it("a refusal before the check-in does not refresh", async () => {
    rpc.checkInWithReadingRpc.mockResolvedValue({ ok: false, error: "no", checkedIn: false });
    const { a, refresh } = make(null);
    expect(await a.reading.onSave(reading)).toEqual({ ok: false, error: "no" });
    expect(refresh).not.toHaveBeenCalled();
  });
  it("Solo marcar checks in with no entry; when already checked in it is a no-op success", async () => {
    rpc.checkInWithReadingRpc.mockResolvedValue({ ok: true, checkinId: "c", created: true });
    expect(await make(null).a.reading.onMark()).toEqual(ok);
    expect(rpc.checkInWithReadingRpc).toHaveBeenCalledWith(client, "h1", null);
    rpc.checkInWithReadingRpc.mockClear();
    expect(await make("c9").a.reading.onMark()).toEqual(ok);
    expect(rpc.checkInWithReadingRpc).not.toHaveBeenCalled();
  });
  it("delete needs today's check-in, else the web copy", async () => {
    expect(await make(null).a.reading.onDelete()).toEqual({ ok: false, error: "Ese día no tiene check-in." });
    rpc.deleteReadingRpc.mockResolvedValue(ok);
    const { a, refresh } = make("c9");
    expect(await a.reading.onDelete()).toEqual(ok);
    expect(rpc.deleteReadingRpc).toHaveBeenCalledWith(client, "c9");
    expect(refresh).toHaveBeenCalled();
  });
  it("creates a book with the user id", async () => {
    rpc.createBookRpc.mockResolvedValue({ ok: true, id: "bk" });
    expect(await make(null).a.reading.onCreateBook({ title: "Dune", author: null, totalPages: null })).toEqual({ ok: true, id: "bk" });
    expect(rpc.createBookRpc).toHaveBeenCalledWith(client, "u1", { title: "Dune", author: null, totalPages: null });
  });
});

describe("log actions: workout", () => {
  const draft = { dayTypes: ["legs" as const], exercises: [] };
  it("checks the habit in first when there is no check-in, then saves on it", async () => {
    track.checkInRpc.mockResolvedValue({ ok: true, checkinId: "c", created: true });
    rpc.saveWorkoutRpc.mockResolvedValue(ok);
    const { a, refresh } = make(null);
    expect(await a.workout.onSave(draft)).toEqual(ok);
    expect(rpc.saveWorkoutRpc).toHaveBeenCalledWith(client, "c", draft);
    expect(refresh).toHaveBeenCalled();
  });
  it("a failed check-in sends nothing; a failed save after the check-in refreshes and reports", async () => {
    track.checkInRpc.mockResolvedValue({ ok: false, error: "no" });
    expect(await make(null).a.workout.onSave(draft)).toEqual({ ok: false, error: "no" });
    expect(rpc.saveWorkoutRpc).not.toHaveBeenCalled();
    track.checkInRpc.mockResolvedValue({ ok: true, checkinId: "c", created: true });
    rpc.saveWorkoutRpc.mockResolvedValue({ ok: false, error: "series" });
    const { a, refresh } = make(null);
    expect(await a.workout.onSave(draft)).toEqual({ ok: false, error: "series" });
    expect(refresh).toHaveBeenCalled();
  });
  it("deletes on today's check-in", async () => {
    rpc.deleteWorkoutRpc.mockResolvedValue(ok);
    expect(await make("c9").a.workout.onDelete()).toEqual(ok);
    expect(rpc.deleteWorkoutRpc).toHaveBeenCalledWith(client, "c9");
  });
});

describe("log actions: cardio and watch", () => {
  const outing = { kind: "run" as const, distanceM: 5000, durationS: 1800, effort: null, note: null };
  const entry = { mediaId: "m", episodes: 1, season: null, episodeTo: null, minutes: null, completed: false, finished: false };
  it("cardio: no check-in checks in with the outing; with one it adds an outing; update and delete address the outing", async () => {
    rpc.checkInWithCardioRpc.mockResolvedValue({ ok: true, checkinId: "c", created: true });
    expect(await make(null).a.cardio.onSave(outing)).toEqual(ok);
    expect(rpc.checkInWithCardioRpc).toHaveBeenCalledWith(client, "h1", outing);
    rpc.addCardioRpc.mockResolvedValue({ ok: true, id: "e" });
    expect(await make("c9").a.cardio.onSave(outing)).toEqual(ok);
    expect(rpc.addCardioRpc).toHaveBeenCalledWith(client, "c9", outing);
    rpc.updateCardioRpc.mockResolvedValue(ok);
    rpc.deleteCardioRpc.mockResolvedValue(ok);
    expect(await make("c9").a.cardio.onUpdate("e1", outing)).toEqual(ok);
    expect(rpc.updateCardioRpc).toHaveBeenCalledWith(client, "e1", outing);
    expect(await make("c9").a.cardio.onDelete("e1")).toEqual(ok);
    expect(rpc.deleteCardioRpc).toHaveBeenCalledWith(client, "e1");
  });
  it("watch: save, mark, delete and create a title", async () => {
    rpc.checkInWithWatchRpc.mockResolvedValue({ ok: true, checkinId: "c", created: true });
    expect(await make(null).a.watch.onSave(entry)).toEqual(ok);
    rpc.saveWatchRpc.mockResolvedValue(ok);
    expect(await make("c9").a.watch.onSave(entry)).toEqual(ok);
    expect(rpc.saveWatchRpc).toHaveBeenCalledWith(client, "c9", entry);
    expect(await make(null).a.watch.onMark()).toEqual(ok);
    expect(rpc.checkInWithWatchRpc).toHaveBeenLastCalledWith(client, "h1", null);
    rpc.deleteWatchRpc.mockResolvedValue(ok);
    expect(await make("c9").a.watch.onDelete()).toEqual(ok);
    rpc.createMediaRpc.mockResolvedValue({ ok: true, id: "m9" });
    expect(await make(null).a.watch.onCreateMedia({ title: "Dark", kind: "series", totalSeasons: null, totalEpisodes: null, runtimeMin: null })).toEqual({ ok: true, id: "m9" });
    expect(rpc.createMediaRpc).toHaveBeenCalledWith(client, "u1", expect.objectContaining({ title: "Dark" }));
  });
});

describe("log actions: lists", () => {
  it("a created book, title or exercise refreshes the lists; a failed one does not", async () => {
    rpc.createBookRpc.mockResolvedValue({ ok: true, id: "bk" });
    rpc.createExerciseRpc.mockResolvedValue({ ok: false, error: "dup" });
    const { a, refresh } = make(null);
    await a.reading.onCreateBook({ title: "Dune", author: null, totalPages: null });
    expect(refresh).toHaveBeenCalledTimes(1);
    await a.workout.onCreateExercise({ name: "Remo", group: "back" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
