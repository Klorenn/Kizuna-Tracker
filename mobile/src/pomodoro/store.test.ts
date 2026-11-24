import { createPomodoroStore, type PomodoroDeps } from "./store";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);

function setup(startAt = T0) {
  let clock = startAt;
  const mem = new Map<string, string>();
  const scheduled: { id: string; at: number; habitId: string }[] = [];
  const cancelled: string[] = [];
  let n = 0;
  let b = 0;
  const deps: PomodoroDeps = {
    storage: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v), remove: (k) => void mem.delete(k) },
    scheduler: {
      schedule: async ({ at, habitId }) => {
        const id = `n${++n}`;
        scheduled.push({ id, at, habitId });
        return id;
      },
      cancel: async (id) => void cancelled.push(id),
    },
    now: () => clock,
    newId: () => `block-${++b}`,
  };
  return { store: createPomodoroStore(deps), deps, mem, scheduled, cancelled, tick: (ms: number) => (clock += ms), setClock: (t: number) => (clock = t) };
}
const start = (s: ReturnType<typeof setup>, minutes = 25) =>
  s.store.start({ habitId: "ht", minutes, topic: null, day: "2026-11-25", zone: "America/Santiago" });

describe("pomodoro store", () => {
  it("starts from a stored start instant and schedules the end notification", async () => {
    const s = setup();
    const r = await start(s);
    expect(r).toMatchObject({ ok: true });
    expect(s.scheduled).toEqual([{ id: "n1", at: T0 + 25 * MIN, habitId: "ht" }]);
    expect(s.store.view()).toEqual({ kind: "running", habitId: "ht", minutes: 25, remainingMs: 25 * MIN });
  });

  it("remaining time derives from startedAt, not from counting ticks", async () => {
    const s = setup();
    await start(s);
    s.tick(10 * MIN + 3_000);
    expect(s.store.view()).toMatchObject({ kind: "running", remainingMs: 15 * MIN - 3_000 });
    s.tick(2 * 60 * MIN); // the app slept far past the end
    expect(s.store.view()).toEqual({ kind: "finished", habitId: "ht", minutes: 25 });
  });

  it("survives an app restart: a new store over the same storage continues the timer", async () => {
    const s = setup();
    await start(s);
    s.tick(5 * MIN);
    const reopened = createPomodoroStore(s.deps);
    expect(reopened.view()).toMatchObject({ kind: "running", remainingMs: 20 * MIN });
  });

  it("cancel cancels the scheduled notification and forgets the timer", async () => {
    const s = setup();
    await start(s);
    await s.store.cancel();
    expect(s.cancelled).toEqual(["n1"]);
    expect(s.store.view()).toEqual({ kind: "idle" });
    expect(s.mem.size).toBe(0);
  });

  it("one timer at a time", async () => {
    const s = setup();
    await start(s);
    await expect(start(s)).resolves.toEqual({ ok: false, error: "Ya hay un Pomodoro en marcha." });
    expect(s.scheduled).toHaveLength(1);
  });

  it("refuses minutes out of 1-90 and keeps the web copy", async () => {
    const s = setup();
    await expect(start(s, 0)).resolves.toEqual({ ok: false, error: "Elige entre 1 y 90 minutos." });
    await expect(start(s, 91)).resolves.toEqual({ ok: false, error: "Elige entre 1 y 90 minutos." });
    expect(s.scheduled).toHaveLength(0);
  });

  it("a finished timer yields the full block ended at the real end, with a stable block id, and clears", async () => {
    const s = setup();
    await start(s);
    s.tick(40 * MIN);
    const block = await s.store.finish();
    expect(block).toEqual({
      ok: true,
      block: { habitId: "ht", blockId: "block-1", minutes: 25, endedAt: T0 + 25 * MIN, topic: null, day: "2026-11-25", zone: "America/Santiago" },
    });
    expect(s.store.view()).toEqual({ kind: "idle" });
  });

  it("finishing early credits the elapsed whole minutes and cancels the notification", async () => {
    const s = setup();
    await start(s);
    s.tick(12 * MIN + 40_000);
    const r = await s.store.finish();
    expect(r).toMatchObject({ ok: true, block: { minutes: 12, endedAt: T0 + 12 * MIN + 40_000 } });
    expect(s.cancelled).toEqual(["n1"]);
  });

  it("under a minute is too short: nothing to credit, the timer is cleared", async () => {
    const s = setup();
    await start(s);
    s.tick(30_000);
    await expect(s.store.finish()).resolves.toEqual({ ok: false, error: "Menos de un minuto: no hay nada que sumar." });
    expect(s.store.view()).toEqual({ kind: "idle" });
  });

  it("corrupted storage is idle", () => {
    const s = setup();
    s.mem.set("kz-pomodoro-v1", "{nope");
    expect(createPomodoroStore(s.deps).view()).toEqual({ kind: "idle" });
  });

  it("works under fake timers too (no setInterval needed)", async () => {
    jest.useFakeTimers().setSystemTime(T0);
    const s = setup(Date.now());
    s.deps.now = () => Date.now();
    await start(s, 25);
    jest.advanceTimersByTime(25 * MIN);
    expect(s.store.view()).toMatchObject({ kind: "finished" });
    jest.useRealTimers();
  });
});
