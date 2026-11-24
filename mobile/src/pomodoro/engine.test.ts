import { loadPomodoro, stateKey, type KeyValueStorage } from "@/lib/pomodoro-core";
import { createPomodoroEngine } from "./engine";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);

function setup(startAt = T0, existing?: Map<string, string>) {
  let clock = startAt;
  const mem = existing ?? new Map<string, string>();
  const storage: KeyValueStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  const scheduled: { id: string; at: number; title: string; body: string; habitId: string }[] = [];
  const cancelled: string[] = [];
  let n = 0;
  let b = 0;
  const engine = createPomodoroEngine({
    habitId: "h1",
    habitName: "Estudio",
    storage,
    scheduler: {
      schedule: async ({ at, title, body, habitId }) => {
        const id = `n${++n}`;
        scheduled.push({ id, at, title, body, habitId });
        return id;
      },
      cancel: async (id) => void cancelled.push(id),
    },
    now: () => clock,
    newId: () => `id-${++b}`,
  });
  return { engine, storage, mem, scheduled, cancelled, advance: (ms: number) => (clock += ms), setClock: (t: number) => (clock = t) };
}

describe("pomodoro engine (shared reducer + storage + per-phase notifications)", () => {
  it("starts a pomodoro, persists it and schedules the focus end and the break end", async () => {
    const t = setup();
    t.engine.load();
    t.engine.act.start();
    await t.engine.settled();
    expect(t.engine.get().s).toMatchObject({ phase: "focus", cycle: 1 });
    expect(loadPomodoro("h1", t.storage, T0)?.phase).toBe("focus");
    expect(t.scheduled.map((s) => s.at)).toEqual([T0 + 25 * MIN, T0 + 30 * MIN]);
    expect(t.scheduled.every((s) => s.habitId === "h1")).toBe(true);
  });
  it("a tick that changes nothing does not reschedule; pause cancels, resume reschedules at the moved end", async () => {
    const t = setup();
    t.engine.load();
    t.engine.act.start();
    t.advance(5 * MIN);
    t.engine.act.tick();
    await t.engine.settled();
    expect(t.scheduled).toHaveLength(2);
    t.engine.act.pause();
    await t.engine.settled();
    expect(t.cancelled.sort()).toEqual(["n1", "n2"]);
    t.advance(10 * MIN);
    t.engine.act.resume();
    await t.engine.settled();
    expect(t.scheduled.slice(2).map((s) => s.at)).toEqual([T0 + 35 * MIN, T0 + 40 * MIN]);
  });
  it("stop (finish) and reset cancel what is scheduled; finishing early keeps the whole minutes as a pending block", async () => {
    const t = setup();
    t.engine.load();
    t.engine.act.start();
    await t.engine.settled();
    t.advance(10 * MIN + 20_000);
    t.engine.act.finish();
    await t.engine.settled();
    expect(t.cancelled.sort()).toEqual(["n1", "n2"]);
    expect(t.engine.get().s.pending).toEqual([{ blockId: "id-1", minutes: 10, endedAt: T0 + 10 * MIN + 20_000 }]);
  });
  it("a block that ended while the app was killed is settled on load (focus closes, break starts), nothing scheduled in the past", async () => {
    const t = setup();
    t.engine.load();
    t.engine.act.start();
    await t.engine.settled();
    const again = setup(T0 + 27 * MIN, t.mem);
    const box = again.engine.load();
    await again.engine.settled();
    expect(box.s.phase).toBe("break");
    expect(box.s.pending).toEqual([{ blockId: "id-1", minutes: 25, endedAt: T0 + 25 * MIN }]);
    expect(box.session).toMatchObject({ blocks: 1, minutes: 25, lastStatus: "pending" });
    expect(again.scheduled.map((s) => s.at)).toEqual([T0 + 30 * MIN]);
  });
  it("timer and stopwatch modes: stopwatch schedules only the 4 hour cap", async () => {
    const t = setup();
    t.engine.load();
    t.engine.act.setMode("stopwatch", { focusMin: 25, breakMin: 5, cycles: 4 });
    t.engine.act.start();
    await t.engine.settled();
    expect(t.scheduled.map((s) => s.at)).toEqual([T0 + 240 * MIN]);
  });
  it("a notification refused (no permission, null id) is not asked again on every change", async () => {
    const t = setup();
    let asked = 0;
    const engine = createPomodoroEngine({
      habitId: "h1",
      habitName: "E",
      storage: t.storage,
      scheduler: { schedule: async () => (asked++, null), cancel: async () => undefined },
      now: () => T0,
      newId: () => "x",
    });
    engine.load();
    engine.act.start();
    await engine.settled();
    const first = asked;
    engine.act.tick();
    await engine.settled();
    expect(asked).toBe(first);
  });
  it("flush credits pending blocks through the send function: confirm clears them, retryable keeps them, block_expired drops them", async () => {
    const t = setup();
    t.engine.load();
    t.engine.act.start();
    t.advance(25 * MIN);
    t.engine.act.tick();
    const sent: string[] = [];
    const ok = await t.engine.flush(async (_h, b) => (sent.push(b.blockId), { ok: true, credited: true, totalMinutes: 25 }), null, "America/Santiago");
    expect(sent).toEqual(["id-1"]);
    expect(ok).toMatchObject({ retryable: false, credited: true, totalMinutes: 25 });
    expect(t.engine.get().s.pending).toEqual([]);
    expect(t.engine.get().session.lastStatus).toBe("confirmed");
  });
  it("flush keeps a block when the network fails, and drops it with the server copy when it expired", async () => {
    const t = setup();
    t.engine.load();
    t.engine.act.start();
    t.advance(25 * MIN);
    t.engine.act.tick();
    const net = await t.engine.flush(async () => ({ ok: false, error: "x", retry: true }), null, "UTC");
    expect(net.retryable).toBe(true);
    expect(t.engine.get().s.pending).toHaveLength(1);
    const dead = await t.engine.flush(async () => ({ ok: false, error: "Un bloque terminó ayer y ya no se puede sumar.", retry: false, code: "block_expired" }), null, "UTC");
    expect(dead.lines).toEqual(["Un bloque terminó ayer y ya no se puede sumar."]);
    expect(t.engine.get().s.pending).toEqual([]);
    expect(t.engine.get().session.lastStatus).toBe("dropped");
  });
  it("muted prefs schedule silent notifications, and toggling the mute reschedules a running timer", async () => {
    const t = setup();
    const silents: boolean[] = [];
    const engine = createPomodoroEngine({
      habitId: "h1",
      habitName: "E",
      storage: t.storage,
      scheduler: { schedule: async ({ silent }) => (silents.push(silent === true), "id"), cancel: async () => undefined },
      now: () => T0,
      newId: () => "x",
    });
    engine.load();
    engine.act.start();
    await engine.settled();
    expect(silents).toEqual([false, false]);
    t.storage.setItem("kizuna:pomodoro:config:h1", JSON.stringify({ preset: "25-5", config: { focusMin: 25, breakMin: 5, cycles: 4 }, topic: "", muted: true, mode: "pomodoro", timerMin: 25, habitName: "" }));
    engine.resync();
    await engine.settled();
    expect(silents).toEqual([false, false, true, true]);
  });
  it("the habit name used in the notification text can be set after the engine exists", async () => {
    const t = setup();
    t.engine.load();
    t.engine.setHabitName("Cálculo");
    t.engine.act.start();
    await t.engine.settled();
    expect(t.scheduled[0].body).toBe("25 min de foco en Cálculo. Toma un descanso.");
  });
  it("corrupted storage starts idle instead of crashing", () => {
    const t = setup();
    t.mem.set(stateKey("h1"), "{broken");
    expect(t.engine.load().s.phase).toBe("idle");
  });
  it("an idle state reads its config from the saved prefs (mode, timer minutes)", () => {
    const t = setup();
    t.mem.set("kizuna:pomodoro:config:h1", JSON.stringify({ preset: "50-10", config: { focusMin: 50, breakMin: 10, cycles: 2 }, topic: "", muted: false, mode: "timer", timerMin: 45, habitName: "" }));
    const box = t.engine.load();
    expect(box.s.mode).toBe("timer");
    expect(box.s.config.focusMin).toBe(45);
  });
  it("saved states are written with the rev rule: the stored rev follows the box", () => {
    const t = setup();
    t.engine.load();
    t.engine.act.start();
    expect(loadPomodoro("h1", t.storage, T0)?.rev).toBe(t.engine.get().s.rev);
  });
});
