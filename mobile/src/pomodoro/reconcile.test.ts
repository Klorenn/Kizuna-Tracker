import { initialPomodoro, pomodoroReducer } from "@/domain/pomodoro";
import { loadPomodoro, loadSession, savePomodoro, type KeyValueStorage } from "@/lib/pomodoro-core";
import { reconcilePendingBlocks } from "./reconcile";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
const mem = () => {
  const m = new Map<string, string>();
  const storage: KeyValueStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  return { m, storage };
};
const running = (habitId: string, mode: "pomodoro" | "timer" = "pomodoro") =>
  pomodoroReducer(initialPomodoro(habitId, { focusMin: 25, breakMin: 5, cycles: 4 }, mode), { type: "start", at: T0, blockId: `blk-${habitId}` });
const okSend = (log: string[]) => async (h: string, b: { blockId: string }) => (log.push(`${h}:${b.blockId}`), { ok: true as const, credited: true, totalMinutes: 25 });

describe("reconcile blocks finished while the app was killed", () => {
  it("settles an expired focus and credits its block by id", async () => {
    const { storage } = mem();
    savePomodoro(running("h1"), storage);
    const log: string[] = [];
    const r = await reconcilePendingBlocks({ storage, habitIds: ["h1"], send: okSend(log), timeZone: "UTC", now: T0 + 40 * MIN });
    expect(log).toEqual(["h1:blk-h1"]);
    expect(r).toMatchObject({ credited: true, retryable: false, lines: [] });
    const s = loadPomodoro("h1", storage, T0 + 40 * MIN)!;
    expect(s.pending).toEqual([]);
    expect(s.credited).toBe(1);
    expect(loadSession("h1", storage)).toMatchObject({ blocks: 1, minutes: 25, lastStatus: "confirmed" });
  });
  it("is idempotent: a second run sends nothing, and a running timer with nothing finished is left alone", async () => {
    const { storage } = mem();
    savePomodoro(running("h1"), storage);
    savePomodoro(running("h2"), storage);
    const log: string[] = [];
    await reconcilePendingBlocks({ storage, habitIds: ["h1", "h2"], send: okSend(log), timeZone: "UTC", now: T0 + 30 * MIN });
    expect(log).toEqual(["h1:blk-h1", "h2:blk-h2"]);
    await reconcilePendingBlocks({ storage, habitIds: ["h1", "h2"], send: okSend(log), timeZone: "UTC", now: T0 + 31 * MIN });
    expect(log).toHaveLength(2);
    const { storage: s2 } = mem();
    savePomodoro(running("h3"), s2);
    const raw = JSON.stringify(running("h3"));
    await reconcilePendingBlocks({ storage: s2, habitIds: ["h3"], send: okSend([]), timeZone: "UTC", now: T0 + 5 * MIN });
    expect(s2.getItem("kizuna:pomodoro:h3")).toBe(raw);
  });
  it("network trouble keeps the block pending and reports it retryable; the server's block_expired drops it with its copy", async () => {
    const { storage } = mem();
    savePomodoro(running("h1"), storage);
    const net = await reconcilePendingBlocks({ storage, habitIds: ["h1"], send: async () => ({ ok: false, error: "x", retry: true }), timeZone: "UTC", now: T0 + 40 * MIN });
    expect(net).toMatchObject({ retryable: true, credited: false });
    expect(loadPomodoro("h1", storage, T0 + 40 * MIN)!.pending).toHaveLength(1);
    const dead = await reconcilePendingBlocks({
      storage,
      habitIds: ["h1"],
      send: async () => ({ ok: false, error: "Un bloque terminó ayer y ya no se puede sumar.", retry: false, code: "block_expired" }),
      timeZone: "UTC",
      now: T0 + 41 * MIN,
    });
    expect(dead.lines).toEqual(["Un bloque terminó ayer y ya no se puede sumar."]);
    expect(loadPomodoro("h1", storage, T0 + 41 * MIN)!.pending).toEqual([]);
  });
  it("uses the topic saved in the habit prefs", async () => {
    const { storage } = mem();
    savePomodoro(running("h1"), storage);
    storage.setItem("kizuna:pomodoro:config:h1", JSON.stringify({ preset: "25-5", config: { focusMin: 25, breakMin: 5, cycles: 4 }, topic: "Cálculo", muted: false, mode: "pomodoro", timerMin: 25, habitName: "E" }));
    const topics: (string | null)[] = [];
    await reconcilePendingBlocks({ storage, habitIds: ["h1"], send: async (_h, _b, t) => (topics.push(t), { ok: true, credited: true, totalMinutes: 25 }), timeZone: "UTC", now: T0 + 30 * MIN });
    expect(topics).toEqual(["Cálculo"]);
  });
  it("skips habits without a stored timer", async () => {
    const { storage } = mem();
    const r = await reconcilePendingBlocks({ storage, habitIds: ["nope"], send: okSend([]), timeZone: "UTC", now: T0 });
    expect(r).toEqual({ credited: false, retryable: false, lines: [], totalMinutes: null });
  });
});
