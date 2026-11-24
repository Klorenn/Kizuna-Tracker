import { act, renderHook } from "@testing-library/react-native";
import type { KeyValueStorage } from "@/lib/pomodoro-core";
import { createPomodoroEngine } from "./engine";
import { usePomodoro } from "./use-pomodoro";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 25, 15, 0, 0);

const make = () => {
  const mem = new Map<string, string>();
  const storage: KeyValueStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  let n = 0;
  return createPomodoroEngine({
    habitId: "h1",
    habitName: "Estudio",
    storage,
    scheduler: { schedule: async () => "n", cancel: async () => undefined },
    now: Date.now,
    newId: () => `id-${++n}`,
  });
};

describe("usePomodoro", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => jest.useRealTimers());

  it("starts idle and a start tap moves to the first focus round", async () => {
    const engine = make();
    const { result } = await renderHook(() => usePomodoro(engine));
    expect(result.current.box.s.phase).toBe("idle");
    await act(async () => result.current.act.start());
    expect(result.current.box.s).toMatchObject({ phase: "focus", cycle: 1 });
  });
  it("the per-second tick settles a focus that ran out into a break and queues its block", async () => {
    const engine = make();
    const { result } = await renderHook(() => usePomodoro(engine));
    await act(async () => result.current.act.start());
    await act(async () => {
      jest.setSystemTime(T0 + 25 * MIN + 500);
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.box.s.phase).toBe("break");
    expect(result.current.box.s.pending).toEqual([{ blockId: "id-1", minutes: 25, endedAt: T0 + 25 * MIN }]);
  });
  it("pause stops the countdown and resume continues it", async () => {
    const engine = make();
    const { result } = await renderHook(() => usePomodoro(engine));
    await act(async () => result.current.act.start());
    await act(async () => {
      jest.setSystemTime(T0 + 5 * MIN);
      result.current.act.pause();
    });
    expect(result.current.box.s.pausedAt).toBe(T0 + 5 * MIN);
    await act(async () => {
      jest.setSystemTime(T0 + 9 * MIN);
      result.current.act.resume();
    });
    expect(result.current.box.s.pausedAt).toBeNull();
    expect(result.current.box.s.pausedMs).toBe(4 * MIN);
  });
});
