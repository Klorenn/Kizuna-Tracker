import { initialPomodoro, pomodoroReducer, type PomodoroState } from "@/domain/pomodoro";
import { planNotifications } from "./plan";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);
const ids: [string, string, string] = ["a", "b", "c"];
const run = (mode: "pomodoro" | "timer" | "stopwatch", cycles: number | null = 4): PomodoroState =>
  pomodoroReducer(initialPomodoro("h1", { focusMin: 25, breakMin: 5, cycles }, mode), { type: "start", at: T0, blockId: "b1", blockIds: ids });

describe("planNotifications: one local notification per phase end", () => {
  it("nothing while idle, ready or done", () => {
    expect(planNotifications(initialPomodoro("h1", { focusMin: 25, breakMin: 5, cycles: 4 }), "Estudio", T0)).toBeNull();
    expect(planNotifications({ ...run("pomodoro"), phase: "ready" }, "Estudio", T0)).toBeNull();
  });
  it("pomodoro focus: the focus end and, because the break follows by itself, the break end too", () => {
    const p = planNotifications(run("pomodoro"), "Estudio", T0 + MIN)!;
    expect(p.items.map((i) => i.at)).toEqual([T0 + 25 * MIN, T0 + 30 * MIN]);
    expect(p.items[0]).toMatchObject({ title: "Terminó el foco", body: "25 min de foco en Estudio. Toma un descanso." });
    expect(p.items[1]).toMatchObject({ title: "Terminó el descanso", body: "Listo para otra ronda." });
  });
  it("last round of a pomodoro: only the focus end, no break after it", () => {
    const p = planNotifications(run("pomodoro", 1), "Estudio", T0)!;
    expect(p.items).toHaveLength(1);
    expect(p.items[0].body).toBe("25 min de foco en Estudio.");
  });
  it("break: just the break end", () => {
    const brk = { ...run("pomodoro"), phase: "break" as const, phaseStartedAt: T0 + 25 * MIN, blockId: null };
    const p = planNotifications(brk, "Estudio", T0 + 26 * MIN)!;
    expect(p.items.map((i) => i.at)).toEqual([T0 + 30 * MIN]);
  });
  it("paused: nothing is scheduled; resuming moves the end by the time paused", () => {
    const paused = pomodoroReducer(run("pomodoro"), { type: "pause", at: T0 + 10 * MIN });
    expect(planNotifications(paused, "Estudio", T0 + 11 * MIN)).toBeNull();
    const resumed = pomodoroReducer(paused, { type: "resume", at: T0 + 15 * MIN });
    expect(planNotifications(resumed, "Estudio", T0 + 15 * MIN)!.items[0].at).toBe(T0 + 30 * MIN);
  });
  it("timer: one end; stopwatch: the 4 hour cap", () => {
    expect(planNotifications(run("timer"), "Estudio", T0)!.items.map((i) => i.at)).toEqual([T0 + 25 * MIN]);
    const sw = planNotifications(run("stopwatch"), "Estudio", T0)!;
    expect(sw.items.map((i) => i.at)).toEqual([T0 + 240 * MIN]);
    expect(sw.items[0].title).toBe("Cronómetro detenido");
  });
  it("a moment already past is not scheduled; the signature changes with the end instants", () => {
    expect(planNotifications(run("timer"), "Estudio", T0 + 26 * MIN)).toBeNull();
    const a = planNotifications(run("pomodoro"), "Estudio", T0)!;
    const b = planNotifications(pomodoroReducer(pomodoroReducer(run("pomodoro"), { type: "pause", at: T0 + MIN }), { type: "resume", at: T0 + 3 * MIN }), "Estudio", T0 + 3 * MIN)!;
    expect(a.sig).not.toBe(b.sig);
    expect(planNotifications(run("pomodoro"), "Estudio", T0 + 5000)!.sig).toBe(a.sig);
  });
});
